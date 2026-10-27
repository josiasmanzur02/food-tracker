import Foundation
import HealthKit

/// Read-only HealthKit access. All values stay in the app's local web view storage.
final class HealthStore {
    private let store = HKHealthStore()
    private let quantities: [(String, HKQuantityTypeIdentifier, HKUnit)] = [
        ("steps", .stepCount, .count()),
        ("activeEnergyKcal", .activeEnergyBurned, .kilocalorie()),
        ("exerciseMinutes", .appleExerciseTime, .minute()),
        ("standMinutes", .appleStandTime, .minute())
    ]

    private func checkAvailability() throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw failure("Apple Health is unavailable on this device.")
        }
    }

    private func failure(_ message: String) -> NSError {
        NSError(domain: "CalorieTrack.Health", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    func authorize() async throws {
        try checkAvailability()
        var types: Set<HKObjectType> = Set(quantities.compactMap { HKQuantityType.quantityType(forIdentifier: $0.1) })
        types.insert(HKObjectType.workoutType())
        types.insert(HKObjectType.activitySummaryType())
        // Completion means the permission sheet finished, not that read access was granted.
        try await store.requestAuthorization(toShare: [], read: types)
    }

    private static func dateKey(_ date: Date, calendar: Calendar) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
    }

    private static func isMissingData(_ error: Error?) -> Bool {
        guard let error = error as? HKError else { return false }
        return error.code == .errorAuthorizationDenied || error.code == .errorNoData
    }

    private func dailyTotals(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit,
                             start: Date, end: Date, calendar: Calendar) async throws -> [String: Double] {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else { return [:] }
        return try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            // Let HealthKit combine sources; never add iPhone and Watch sample totals ourselves.
            let query = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: predicate,
                options: .cumulativeSum, anchorDate: start, intervalComponents: DateComponents(day: 1))
            query.initialResultsHandler = { _, collection, error in
                if let error, !Self.isMissingData(error) { continuation.resume(throwing: error); return }
                var totals: [String: Double] = [:]
                collection?.enumerateStatistics(from: start, to: end) { statistics, _ in
                    if let sum = statistics.sumQuantity() {
                        totals[Self.dateKey(statistics.startDate, calendar: calendar)] = sum.doubleValue(for: unit)
                    }
                }
                continuation.resume(returning: totals)
            }
            store.execute(query)
        }
    }

    private func summaries(start: Date, end: Date, calendar: Calendar) async throws -> [HKActivitySummary] {
        try await withCheckedThrowingContinuation { continuation in
            var first = calendar.dateComponents([.era, .year, .month, .day], from: start)
            first.calendar = calendar
            var last = calendar.dateComponents([.era, .year, .month, .day], from: end)
            last.calendar = calendar
            let predicate = HKQuery.predicate(forActivitySummariesBetweenStart: first, end: last)
            let query = HKActivitySummaryQuery(predicate: predicate) { _, values, error in
                if let error, !Self.isMissingData(error) { continuation.resume(throwing: error); return }
                continuation.resume(returning: values ?? [])
            }
            store.execute(query)
        }
    }

    private func workouts(start: Date, end: Date) async throws -> [HKWorkout] {
        try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]) { _, samples, error in
                if let error, !Self.isMissingData(error) { continuation.resume(throwing: error); return }
                continuation.resume(returning: samples as? [HKWorkout] ?? [])
            }
            store.execute(query)
        }
    }

    private func workoutName(_ type: HKWorkoutActivityType) -> (String, String) {
        switch type {
        case .walking: return ("walking", "Walk")
        case .running: return ("running", "Run")
        case .soccer: return ("soccer", "Football")
        case .americanFootball: return ("americanFootball", "American football")
        case .australianFootball: return ("australianFootball", "Australian football")
        case .rugby: return ("rugby", "Rugby")
        case .cycling: return ("cycling", "Cycling")
        case .swimming: return ("swimming", "Swimming")
        case .hiking: return ("hiking", "Hike")
        case .functionalStrengthTraining: return ("functionalStrengthTraining", "Functional strength")
        case .traditionalStrengthTraining: return ("traditionalStrengthTraining", "Strength training")
        case .highIntensityIntervalTraining: return ("hiit", "Interval training")
        case .yoga: return ("yoga", "Yoga")
        default: return (String(type.rawValue), "Workout")
        }
    }

    func snapshot() async throws -> [String: Any] {
        try checkAvailability()
        let calendar = Calendar.current
        let now = Date()
        let today = calendar.startOfDay(for: now)
        let start = calendar.date(byAdding: .day, value: -29, to: today)!
        async let steps = dailyTotals(.stepCount, unit: .count(), start: start, end: now, calendar: calendar)
        async let energy = dailyTotals(.activeEnergyBurned, unit: .kilocalorie(), start: start, end: now, calendar: calendar)
        async let exercise = dailyTotals(.appleExerciseTime, unit: .minute(), start: start, end: now, calendar: calendar)
        async let standing = dailyTotals(.appleStandTime, unit: .minute(), start: start, end: now, calendar: calendar)
        async let rings = summaries(start: start, end: now, calendar: calendar)
        async let sessions = workouts(start: start, end: now)
        let (stepTotals, energyTotals, exerciseTotals, standTotals, dailyRings, recordedWorkouts) =
            try await (steps, energy, exercise, standing, rings, sessions)
        let ringsByDate = Dictionary(dailyRings.map { summary in
            let date = calendar.date(from: summary.dateComponents(for: calendar))!
            return (Self.dateKey(date, calendar: calendar), summary)
        }, uniquingKeysWith: { _, latest in latest })

        let days: [[String: Any]] = (0..<30).map { offset in
            let key = Self.dateKey(calendar.date(byAdding: .day, value: offset, to: start)!, calendar: calendar)
            let ring = ringsByDate[key]
            let moveTime = ring?.activityMoveMode == .appleMoveTime
            return [
                "date": key,
                "steps": stepTotals[key] as Any? ?? NSNull(),
                "activeEnergyKcal": ring?.activeEnergyBurned.doubleValue(for: .kilocalorie()) ?? energyTotals[key] as Any? ?? NSNull(),
                "moveMinutes": ring?.appleMoveTime.doubleValue(for: .minute()) as Any? ?? NSNull(),
                "moveMode": moveTime ? "time" : "energy",
                "exerciseMinutes": ring?.appleExerciseTime.doubleValue(for: .minute()) ?? exerciseTotals[key] as Any? ?? NSNull(),
                "standMinutes": standTotals[key] as Any? ?? NSNull(),
                "standHours": ring?.appleStandHours.doubleValue(for: .count()) as Any? ?? NSNull(),
                "moveGoal": (moveTime ? ring?.appleMoveTimeGoal.doubleValue(for: .minute()) : ring?.activeEnergyBurnedGoal.doubleValue(for: .kilocalorie())) as Any? ?? NSNull(),
                "exerciseGoalMinutes": ring?.exerciseTimeGoal?.doubleValue(for: .minute()) as Any? ?? NSNull(),
                "standGoalHours": ring?.standHoursGoal?.doubleValue(for: .count()) as Any? ?? NSNull()
            ]
        }
        let iso = ISO8601DateFormatter()
        let workoutRows: [[String: Any]] = recordedWorkouts.map { workout in
            let (activity, name) = workoutName(workout.workoutActivityType)
            let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!
            return [
                "id": workout.uuid.uuidString,
                "date": Self.dateKey(workout.startDate, calendar: calendar),
                "activity": activity, "name": name,
                "start": iso.string(from: workout.startDate), "end": iso.string(from: workout.endDate),
                "minutes": workout.duration / 60,
                "distanceMeters": workout.totalDistance?.doubleValue(for: .meter()) as Any? ?? NSNull(),
                "activeEnergyKcal": workout.statistics(for: energyType)?.sumQuantity()?.doubleValue(for: .kilocalorie()) as Any? ?? NSNull()
            ]
        }
        return ["startDate": Self.dateKey(start, calendar: calendar), "endDate": Self.dateKey(now, calendar: calendar),
                "syncedAt": iso.string(from: now), "days": days, "workouts": workoutRows]
    }
}
