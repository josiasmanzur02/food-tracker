import type { GoalType, UserProfile, WeightEntry } from '../types';
import { addDays, differenceInDays, getDateKey } from './dates';
import { getCurrentWeightKg, sortWeightEntriesAscending } from './weight';

export interface WeightTrendPoint {
  date: string;
  actualKg: number;
  trendKg: number | null;
}

export interface GoalProjection {
  status: 'insufficient' | 'goalReached' | 'estimable';
  estimatedDate: string | null;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildWeightTrend(entries: WeightEntry[]): WeightTrendPoint[] {
  const orderedEntries = sortWeightEntriesAscending(entries);

  return orderedEntries.map((entry, index) => {
    const trendWindow = orderedEntries.slice(Math.max(0, index - 6), index + 1);

    if (trendWindow.length < 3) {
      return {
        date: entry.date,
        actualKg: entry.weightKg,
        trendKg: null
      };
    }

    return {
      date: entry.date,
      actualKg: entry.weightKg,
      trendKg: average(trendWindow.map((item) => item.weightKg))
    };
  });
}

export function calculateAverageWeeklyChange(entries: WeightEntry[]): number | null {
  const trendPoints = buildWeightTrend(entries).filter(
    (point): point is WeightTrendPoint & { trendKg: number } => point.trendKg !== null
  );

  if (trendPoints.length < 2) {
    return null;
  }

  const firstPoint = trendPoints[0];
  const lastPoint = trendPoints[trendPoints.length - 1];
  const daySpan = differenceInDays(firstPoint.date, lastPoint.date);

  if (daySpan < 14) {
    return null;
  }

  return ((lastPoint.trendKg - firstPoint.trendKg) / daySpan) * 7;
}

function isMovingTowardGoal(goalType: GoalType, weeklyChangeKg: number): boolean {
  if (goalType === 'lose') {
    return weeklyChangeKg < -0.05;
  }

  if (goalType === 'gain') {
    return weeklyChangeKg > 0.05;
  }

  return false;
}

export function estimateGoalProjection(
  profile: UserProfile,
  entries: WeightEntry[]
): GoalProjection {
  const currentWeightKg = getCurrentWeightKg(profile, entries);

  if (
    (profile.goalType === 'lose' && currentWeightKg <= profile.goalWeightKg) ||
    (profile.goalType === 'gain' && currentWeightKg >= profile.goalWeightKg) ||
    profile.goalType === 'maintain'
  ) {
    return { status: 'goalReached', estimatedDate: null };
  }

  const averageWeeklyChangeKg = calculateAverageWeeklyChange(entries);

  if (averageWeeklyChangeKg === null) {
    return { status: 'insufficient', estimatedDate: null };
  }

  if (!isMovingTowardGoal(profile.goalType, averageWeeklyChangeKg)) {
    return { status: 'insufficient', estimatedDate: null };
  }

  const remainingKg =
    profile.goalType === 'lose'
      ? currentWeightKg - profile.goalWeightKg
      : profile.goalWeightKg - currentWeightKg;
  const weeksRemaining = remainingKg / Math.abs(averageWeeklyChangeKg);

  if (!Number.isFinite(weeksRemaining) || weeksRemaining <= 0 || weeksRemaining > 260) {
    return { status: 'insufficient', estimatedDate: null };
  }

  return {
    status: 'estimable',
    estimatedDate: addDays(getDateKey(), Math.round(weeksRemaining * 7))
  };
}
