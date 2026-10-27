import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTrainingData,
  normalizeTraining
} from '../src/services/trainingStorage';
import {
  buildTrainingWeek,
  getTrainingProgress,
  getWeekStart
} from '../src/utils/training';
import { getTrainingActivity, getTrainingWeekLoad } from '../src/utils/trainingActivity';
import { addDays } from '../src/utils/dates';
import { createEmptyAppData, migrateData, saveActivity, getAppData, exportData, importData, resetData } from '../src/services/storage';
import { createAppleHealthData, normalizeAppleHealth, parseHealthSnapshot, readAppleHealth, requestAppleHealthAccess, supportsAppleHealth } from '../src/services/appleHealth';
import {
  normalizeUsdaFoods,
  portionCalories
} from '../src/services/foodNutrition';
import { searchUsdaFoods } from '../src/services/usdaFoodSearch';
import worker from '../worker/src/index.js';
import type { ActivityDay, HealthSnapshot, HealthWorkout, TrainingData, TrainingSession, WorkoutLog } from '../src/types';

const monday = '2026-10-19';
function healthSnapshot(): HealthSnapshot {
  const day: ActivityDay = {
    date: monday, steps: 8400, activeEnergyKcal: 480, moveMinutes: null, moveMode: 'energy',
    exerciseMinutes: 42, standMinutes: 87, standHours: 10,
    moveGoal: 600, exerciseGoalMinutes: 30, standGoalHours: 12
  };
  return {
    startDate: monday, endDate: monday, syncedAt: '2026-10-20T00:15:00Z', days: [day],
    workouts: [
      { id: 'walk', date: monday, activity: 'walking', name: 'Walk', start: '2026-10-19T13:00:00Z', end: '2026-10-19T13:30:00Z', minutes: 30, distanceMeters: 2500, activeEnergyKcal: 130 },
      { id: 'football', date: monday, activity: 'soccer', name: 'Football', start: '2026-10-19T23:00:00Z', end: '2026-10-20T00:00:00Z', minutes: 60, distanceMeters: null, activeEnergyKcal: 350 }
    ]
  };
}

test('v2 backups gain empty activity data without losing training or food', () => {
  const previous = { ...createEmptyAppData(), dataVersion: 2, activity: undefined };
  const result = migrateData(previous);
  assert.deepEqual(result.activity, { syncEnabled: false, snapshot: null });
  assert.deepEqual(result.training, previous.training);
});

test('activity backups preserve units, unavailable readings and local workout dates across midnight', () => {
  const snapshot = parseHealthSnapshot(healthSnapshot());
  const result = migrateData(JSON.parse(JSON.stringify({ ...createEmptyAppData(), activity: { syncEnabled: true, snapshot } })));
  assert.deepEqual(result.activity, { syncEnabled: true, snapshot });
  assert.equal(snapshot.workouts[0].date, monday);
  assert.equal(snapshot.days[0].standHours, 10);
  assert.equal(snapshot.days[0].standMinutes, 87);
  assert.equal(snapshot.days[0].moveMinutes, null);
});

test('invalid Health payloads, duplicate IDs and invalid dates cannot replace a summary', () => {
  const snapshot = healthSnapshot();
  for (const invalid of [
    { ...snapshot, days: [{ ...snapshot.days[0], steps: -1 }] },
    { ...snapshot, days: [{ ...snapshot.days[0], exerciseMinutes: Infinity }] },
    { ...snapshot, days: [{ ...snapshot.days[0], date: '2026-02-30' }] },
    { ...snapshot, days: [snapshot.days[0], snapshot.days[0]] },
    { ...snapshot, workouts: [snapshot.workouts[0], snapshot.workouts[0]] },
    { ...snapshot, workouts: [{ ...snapshot.workouts[0], date: '2026-10-18' }] },
    { ...snapshot, workouts: [{ ...snapshot.workouts[0], end: '2026-10-19T12:00:00Z' }] }
  ]) {
    assert.throws(() => parseHealthSnapshot(invalid));
    assert.equal(normalizeAppleHealth({ snapshot: invalid }).snapshot, null);
  }
});

test('browser cannot claim an Apple Health connection; native access passes through the real bridge', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    assert.equal(supportsAppleHealth(), false);
    await assert.rejects(readAppleHealth(), /iPhone app/);
    const calls: string[] = [];
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      webkit: { messageHandlers: { appleHealth: { postMessage: async ({ action }: { action: string }) => {
        calls.push(action);
        return action === 'read' ? healthSnapshot() : true;
      } } } }
    } });
    assert.equal(supportsAppleHealth(), true);
    await requestAppleHealthAccess();
    const result = await readAppleHealth();
    assert.deepEqual(calls, ['authorize', 'read']);
    assert.equal(result.days[0].steps, 8400);
    assert.equal(result.workouts.length, 2);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('activity refresh replaces deleted workouts, survives backup, disables sync on import and clears on reset', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  } } });
  try {
    saveActivity({ syncEnabled: true, snapshot: healthSnapshot() });
    saveActivity({ syncEnabled: true, snapshot: healthSnapshot() });
    assert.equal(getAppData().activity.snapshot?.workouts.length, 2);
    const updated = { ...healthSnapshot(), workouts: [] };
    saveActivity({ syncEnabled: true, snapshot: updated });
    assert.equal(getAppData().activity.snapshot?.workouts.length, 0);
    const restored = importData(migrateData(JSON.parse(exportData())));
    assert.equal(restored.activity.syncEnabled, false);
    assert.deepEqual(restored.activity.snapshot, parseHealthSnapshot(updated));
    assert.deepEqual(resetData().activity, createAppleHealthData());
    assert.deepEqual(getAppData().activity, createAppleHealthData());
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

function noMatch(): TrainingData {
  const data = createTrainingData();
  data.weeks = [{ weekStart: monday, matchStatus: 'none' }];
  return data;
}
function fixture(data: TrainingData, date: string, minutes = 60) {
  data.matches.push({
    id: date,
    date,
    kickoff: '19:00',
    plannedMinutes: minutes,
    label: 'Game'
  });
}
function completed(
  session: TrainingSession,
  extra: Partial<WorkoutLog> = {}
): WorkoutLog {
  return {
    id: session.date,
    date: session.date,
    session,
    status: 'completed',
    minutes: session.minutes,
    runningMinutes: session.runningMinutes,
    effort: 5,
    shinPain: 'none',
    createdAt: `${session.date}T22:00:00Z`,
    ...extra
  };
}

function syncedWorkout(date: string, activity: string, minutes: number, id = `${date}-${activity}`): HealthWorkout {
  const start = `${date}T10:00:00Z`;
  return { id, date, activity, name: activity, start,
    end: new Date(Date.parse(start) + minutes * 60000).toISOString(), minutes,
    distanceMeters: null, activeEnergyKcal: null };
}
function syncedActivity(workouts: HealthWorkout[], today = monday): HealthSnapshot {
  return { startDate: addDays(today, -29), endDate: today, syncedAt: `${today}T23:59:59Z`, days: [], workouts };
}

test('synced runs consume running and impact limits without rewriting manual history or settings', () => {
  const data = noMatch();
  const today = addDays(monday, 2);
  data.preferences.allowRunning = true;
  data.preferences.allowJumping = true;
  data.checkIns = [{ date: today, energy: 'fresh', shinPain: 'none' }];
  const original = JSON.stringify(data);
  const snapshot = syncedActivity([syncedWorkout(monday, 'running', 60)], today);
  const week = buildTrainingWeek(data, monday, today, snapshot);
  assert.equal(week[0].source, 'appleHealth');
  assert.equal(week[0].runningMinutes, 60);
  assert.ok(week.slice(2).every((session) => !session.impact && session.runningMinutes === 0));
  const load = getTrainingWeekLoad(data, monday, today, snapshot);
  assert.equal(load.runningMinutes, 60);
  assert.equal(load.impactDates.size, 1);
  assert.equal(JSON.stringify(data), original);
});

test('a synced run prevents adjacent impact and respects a one-day weekly impact ceiling', () => {
  const data = noMatch();
  data.preferences.allowRunning = true;
  data.preferences.allowJumping = true;
  const today = addDays(monday, 2);
  data.checkIns = [{ date: today, energy: 'fresh', shinPain: 'none' }];
  const snapshot = syncedActivity([syncedWorkout(addDays(monday, 1), 'running', 15)], today);
  assert.equal(buildTrainingWeek(data, monday, today, snapshot)[2].impact, false);
  data.preferences.maxImpactDays = 1;
  assert.ok(buildTrainingWeek(data, monday, today, snapshot).slice(2).every((session) => !session.impact));
});

test('football recorded only in Health triggers recovery across the week boundary', () => {
  const data = noMatch();
  const snapshot = syncedActivity([syncedWorkout(addDays(monday, -1), 'soccer', 60)]);
  const week = buildTrainingWeek(data, monday, monday, snapshot);
  assert.equal(week[0].kind, 'recovery');
  assert.equal(week[1].kind, 'recovery');
  assert.equal(data.matches.length, 0);
  assert.equal(data.logs.length, 0);
});

test('a recorded football workout does not declare the rest of an unknown fixture week clear', () => {
  const data = createTrainingData();
  const snapshot = syncedActivity([syncedWorkout(monday, 'soccer', 60)]);
  const week = buildTrainingWeek(data, monday, monday, snapshot);
  assert.equal(week[1].kind, 'recovery');
  assert.equal(week[2].kind, 'recovery');
  assert.ok(week.slice(3).every((session) => ['skills', 'primer', 'rest'].includes(session.kind)));
});

test('actual Health football replaces fixture reservations and overrides a skipped match for load', () => {
  const data = noMatch();
  fixture(data, monday, 90);
  const scheduled = buildTrainingWeek(data, monday, monday)[0];
  data.logs = [completed(scheduled, { status: 'skipped', minutes: 0, runningMinutes: 0 })];
  const snapshot = syncedActivity([syncedWorkout(monday, 'soccer', 40)]);
  const load = getTrainingWeekLoad(data, monday, monday, snapshot);
  assert.equal(load.runningMinutes, 40);
  assert.equal(load.reservedRunningMinutes, 0);
  assert.equal(load.impactDates.size, 1);
  const week = buildTrainingWeek(data, monday, monday, snapshot);
  assert.equal(week[0].source, 'appleHealth');
  assert.equal(week[0].minutes, 40);
  assert.equal(week[1].kind, 'recovery');
  assert.equal(week[2].kind, 'recovery');
  assert.equal(data.logs[0].status, 'skipped');
});

test('a recorded walk cannot complete a scheduled football fixture', () => {
  const data = noMatch();
  fixture(data, monday, 90);
  const snapshot = syncedActivity([syncedWorkout(monday, 'walking', 30)]);
  const session = buildTrainingWeek(data, monday, monday, snapshot)[0];
  assert.equal(session.kind, 'match');
  assert.equal(session.source, undefined);
  const load = getTrainingWeekLoad(data, monday, monday, snapshot);
  assert.equal(load.runningMinutes, 0);
  assert.equal(load.reservedRunningMinutes, 90);
});

test('Health walks count as conditioning and do not create catch-up training or running load', () => {
  const data = noMatch();
  const today = addDays(monday, 3);
  const snapshot = syncedActivity([
    syncedWorkout(monday, 'walking', 30),
    syncedWorkout(addDays(monday, 2), 'walking', 25)
  ], today);
  const week = buildTrainingWeek(data, monday, today, snapshot);
  assert.equal(week[0].kind, 'endurance');
  assert.equal(week[0].source, 'appleHealth');
  assert.equal(week[2].source, 'appleHealth');
  assert.ok(week.slice(3).every((session) => session.kind !== 'endurance'));
  assert.equal(getTrainingWeekLoad(data, monday, today, snapshot).runningMinutes, 0);
});

test('synced strength counts toward weekly slots and spacing without inventing kettlebell drills', () => {
  const data = noMatch();
  const today = addDays(monday, 3);
  const snapshot = syncedActivity([
    syncedWorkout(monday, 'traditionalStrengthTraining', 35),
    syncedWorkout(addDays(monday, 2), 'functionalStrengthTraining', 35)
  ], today);
  const week = buildTrainingWeek(data, monday, today, snapshot);
  assert.equal(week[0].kind, 'strength');
  assert.deepEqual(week[0].drills, []);
  assert.ok(week.slice(3).every((session) => !session.kind.startsWith('strength')));
  const spaced = buildTrainingWeek(data, monday, addDays(monday, 1), syncedActivity([snapshot.workouts[0]], addDays(monday, 1)));
  assert.ok(!spaced[1].kind.startsWith('strength'));
});

test('multiple recorded workouts retain all minutes and use one impact day', () => {
  const data = noMatch();
  const snapshot = syncedActivity([syncedWorkout(monday, 'running', 15), syncedWorkout(monday, 'walking', 30)]);
  const load = getTrainingWeekLoad(data, monday, monday, snapshot);
  assert.equal(load.runningMinutes, 15);
  assert.equal(load.impactDates.size, 1);
  const session = buildTrainingWeek(data, monday, monday, snapshot)[0];
  assert.equal(session.minutes, 45);
  assert.equal(session.runningMinutes, 15);
  assert.equal(session.healthWorkoutIds?.length, 2);
});

test('steps, ring calories, Exercise and standing totals alone never change training', () => {
  const data = noMatch();
  const snapshot = { ...healthSnapshot(), workouts: [], days: [{ ...healthSnapshot().days[0],
    steps: 45000, activeEnergyKcal: 2000, exerciseMinutes: 240, standMinutes: 600, standHours: 20 }] };
  assert.deepEqual(buildTrainingWeek(data, monday, monday, snapshot), buildTrainingWeek(data, monday, monday));
});

test('unknown Health effort cannot trigger progression or override pain check-ins', () => {
  const data = noMatch();
  const workouts = [-12, -9, -6, -3].map((offset) => syncedWorkout(addDays(monday, offset), 'traditionalStrengthTraining', 35));
  const snapshot = syncedActivity(workouts);
  const progress = getTrainingProgress(data, monday, snapshot, monday);
  assert.equal(progress.completed, 4);
  assert.equal(progress.minutes, 140);
  assert.equal(progress.mode, 'steady');
  assert.equal(progress.effort, 0);
  data.checkIns = [{ date: monday, energy: 'fresh', shinPain: 'mild' }];
  assert.equal(buildTrainingWeek(data, monday, monday, snapshot)[0].kind, 'recovery');
});

test('matching manual and Health workouts count once and preserve the saved session and feedback', () => {
  const data = noMatch();
  const session: TrainingSession = { ...buildTrainingWeek(data, monday, monday)[0],
    kind: 'endurance', title: 'My walk', minutes: 30, runningMinutes: 0, impact: false };
  const log = completed(session, { minutes: 30, effort: 9, shinPain: 'mild' });
  data.logs = [log];
  const snapshot = syncedActivity([syncedWorkout(monday, 'walking', 32)]);
  const load = getTrainingActivity(data, snapshot, monday);
  assert.equal(load.sessions.length, 1);
  assert.equal(load.sessions[0].minutes, 32);
  assert.equal(load.healthWorkouts[0].logId, log.id);
  assert.deepEqual(buildTrainingWeek(data, monday, monday, snapshot)[0], session);
  assert.equal(getTrainingProgress(data, addDays(monday, 1), snapshot, monday).mode, 'ease');
  assert.equal(getTrainingProgress(data, addDays(monday, 1), snapshot, monday).effort, 9);
  assert.deepEqual(data.logs[0], log);
});

test('pairing controls distinguish separate workouts and allow explicit duration mismatches', () => {
  const data = noMatch();
  const session: TrainingSession = { ...buildTrainingWeek(data, monday, monday)[0], kind: 'endurance', minutes: 30 };
  data.logs = [completed(session)];
  const workout = syncedWorkout(monday, 'walking', 30);
  const snapshot = syncedActivity([workout]);
  data.healthLinks = [{ workoutId: workout.id, logId: null }];
  assert.equal(getTrainingActivity(data, snapshot, monday).sessions.reduce((sum, entry) => sum + entry.minutes, 0), 60);
  data.logs[0].minutes = 90;
  data.healthLinks = [{ workoutId: workout.id, logId: data.logs[0].id }];
  const paired = getTrainingActivity(data, snapshot, monday);
  assert.equal(paired.sessions.length, 1);
  assert.equal(paired.sessions[0].minutes, 90);
  assert.equal(paired.healthWorkouts[0].automatic, false);
  assert.deepEqual(normalizeTraining(JSON.parse(JSON.stringify(data))).healthLinks, data.healthLinks);
});

test('automatic pairing is one-to-one and prefers the closer duration among same-day workouts', () => {
  const data = noMatch();
  const session: TrainingSession = { ...buildTrainingWeek(data, monday, monday)[0], kind: 'endurance', minutes: 40 };
  data.logs = [completed(session)];
  const snapshot = syncedActivity([syncedWorkout(monday, 'walking', 35, 'first'), syncedWorkout(monday, 'walking', 40, 'second')]);
  const load = getTrainingActivity(data, snapshot, monday);
  assert.equal(load.sessions.length, 2);
  assert.equal(load.sessions.reduce((sum, entry) => sum + entry.minutes, 0), 75);
  assert.equal(load.healthWorkouts.find((entry) => entry.workout.id === 'second')?.logId, data.logs[0].id);
  assert.equal(load.healthWorkouts.find((entry) => entry.workout.id === 'first')?.logId, null);
});

test('links to removed Health records cannot block matching a current copy', () => {
  const data = noMatch();
  const session: TrainingSession = { ...buildTrainingWeek(data, monday, monday)[0], kind: 'endurance', minutes: 30 };
  data.logs = [completed(session)];
  data.healthLinks = [{ workoutId: 'deleted-record', logId: data.logs[0].id }];
  const snapshot = syncedActivity([syncedWorkout(monday, 'walking', 30, 'current-record')]);
  const activity = getTrainingActivity(data, snapshot, monday);
  assert.equal(activity.sessions.length, 1);
  assert.equal(activity.healthWorkouts[0].logId, data.logs[0].id);
});

test('a manual match and its Health copy use the larger actual duration, with no fixture reservation', () => {
  const data = noMatch();
  fixture(data, monday, 90);
  data.logs = [completed(buildTrainingWeek(data, monday, monday)[0], { minutes: 45, runningMinutes: 45 })];
  const snapshot = syncedActivity([syncedWorkout(monday, 'soccer', 50)]);
  const load = getTrainingWeekLoad(data, monday, monday, snapshot);
  assert.equal(load.runningMinutes, 50);
  assert.equal(load.reservedRunningMinutes, 0);
  assert.equal(load.completed.length, 1);
});

test('deletions, disconnects and repeated snapshots recompute load without changing saved manual logs', () => {
  const data = noMatch();
  const snapshot = syncedActivity([syncedWorkout(addDays(monday, -1), 'soccer', 60)]);
  assert.deepEqual(getTrainingActivity(data, snapshot, monday), getTrainingActivity(data, snapshot, monday));
  assert.equal(buildTrainingWeek(data, monday, monday, snapshot)[0].kind, 'recovery');
  assert.equal(buildTrainingWeek(data, monday, monday, { ...snapshot, workouts: [] })[0].kind, 'strengthA');
  assert.equal(buildTrainingWeek(data, monday, monday, null)[0].kind, 'strengthA');
  assert.deepEqual(data.logs, []);
});

test('duplicate UUIDs, future workouts and unfinished workouts cannot inflate training load', () => {
  const data = noMatch();
  const workout = syncedWorkout(monday, 'running', 20);
  const snapshot = syncedActivity([workout, workout, syncedWorkout(addDays(monday, 1), 'soccer', 60),
    { ...syncedWorkout(monday, 'soccer', 40), end: `${addDays(monday, 1)}T01:00:00Z` }]);
  const load = getTrainingWeekLoad(data, monday, monday, snapshot);
  assert.equal(load.runningMinutes, 20);
  assert.equal(load.completed.length, 1);
});

test('feedback for a combined Health day retains exact links through backup and manual-log removal', () => {
  const data = noMatch();
  const snapshot = syncedActivity([syncedWorkout(monday, 'walking', 30), syncedWorkout(monday, 'running', 15)]);
  const day = buildTrainingWeek(data, monday, monday, snapshot)[0];
  const log = completed(day, { effort: 8, shinPain: 'mild' });
  data.logs = [log];
  data.healthLinks = day.healthWorkoutIds!.map((workoutId) => ({ workoutId, logId: log.id }));
  const restored = normalizeTraining(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.logs[0].session.source, undefined);
  const paired = getTrainingWeekLoad(restored, monday, monday, snapshot);
  assert.equal(paired.completed.length, 1);
  assert.equal(paired.runningMinutes, 15);
  assert.equal(paired.completed[0].minutes, 45);
  restored.logs = [];
  assert.equal(getTrainingWeekLoad(restored, monday, monday, snapshot).runningMinutes, 15);
  assert.equal(getTrainingActivity(restored, snapshot, monday).sessions.length, 2);
});

test('old backups migrate without losing calorie/weight data; training defaults protect shins', () => {
  const empty = createEmptyAppData();
  const old = {
    ...empty,
    dataVersion: 1,
    training: undefined,
    calorieEntries: [
      {
        id: 'food',
        date: monday,
        calories: 123,
        source: 'manual',
        createdAt: 'x',
        updatedAt: 'x'
      }
    ]
  };
  const result = migrateData(old);
  assert.equal(result.calorieEntries[0].calories, 123);
  assert.equal(result.dataVersion, 3);
  assert.deepEqual(result.activity, createAppleHealthData());
  assert.deepEqual(result.training.preferences.kettlebellsLb, [15, 20]);
  assert.equal(result.training.preferences.allowRunning, false);
  assert.equal(result.training.preferences.allowJumping, false);
});

test('new training and food entries survive backup round trip', () => {
  const data = noMatch();
  fixture(data, addDays(monday, 5));
  data.checkIns.push({ date: monday, energy: 'fresh', shinPain: 'none' });
  data.logs.push(completed(buildTrainingWeek(data, monday, monday)[0]));
  const app = {
    ...createEmptyAppData(),
    training: data,
    calorieEntries: [
      {
        id: 'x',
        date: monday,
        calories: 0,
        source: 'food' as const,
        createdAt: 'x',
        updatedAt: 'x'
      }
    ]
  };
  const result = migrateData(JSON.parse(JSON.stringify(app)));
  assert.deepEqual(result.training, data);
  assert.equal(result.calorieEntries[0].source, 'food');
});

test('malformed training imports cannot enable unsafe values or invalid dates', () => {
  const data = normalizeTraining({
    preferences: {
      weeklyRunMinutes: -8,
      maxImpactDays: 99,
      kettlebellsLb: [0, -1, '20', Infinity],
      allowRunning: 'true'
    },
    checkIns: [
      { date: '2026-02-30', shinPain: 'none' },
      { date: monday, shinPain: 'invalid' }
    ],
    matches: [{ id: 'bad', date: '2026-13-40' }]
  });
  assert.equal(data.preferences.weeklyRunMinutes, 0);
  assert.equal(data.preferences.maxImpactDays, 3);
  assert.equal(data.preferences.allowRunning, false);
  assert.deepEqual(data.preferences.kettlebellsLb, [15, 20]);
  assert.equal(data.matches.length, 0);
  assert.equal(data.checkIns.length, 1);
  assert.equal(data.checkIns[0].shinPain, 'painful');
});

test('no-match week includes two spaced kettlebell sessions, skills, conditioning and rest', () => {
  const week = buildTrainingWeek(noMatch(), monday, monday);
  const strength = week.filter((s) => s.kind.startsWith('strength'));
  assert.equal(strength.length, 2);
  assert.ok(strength[1].date >= addDays(strength[0].date, 2));
  assert.ok(week.some((s) => s.kind === 'endurance'));
  assert.ok(week.some((s) => s.kind === 'skills'));
  assert.ok(week.some((s) => s.kind === 'rest'));
  assert.ok(week.every((s) => s.runningMinutes === 0 && !s.impact));
  assert.match(strength[0].drills.map((d) => d.dose).join(' '), /15 lb/);
  assert.match(strength[0].drills.map((d) => d.dose).join(' '), /20 lb/);
});

test('unknown fixture protects Wednesday through Sunday', () => {
  const week = buildTrainingWeek(createTrainingData(), monday, monday);
  assert.ok(
    week.slice(2).every((s) => ['skills', 'primer', 'rest'].includes(s.kind))
  );
});

for (const offset of [3, 4, 5, 6])
  test(`match on weekday ${offset}: taper and recovery replace sessions`, () => {
    const data = noMatch();
    const matchDay = addDays(monday, offset);
    fixture(data, matchDay);
    const week = buildTrainingWeek(data, monday, monday);
    assert.equal(week[offset].kind, 'match');
    assert.equal(week[offset - 1].kind, 'primer');
    assert.equal(week[offset - 2].kind, 'skills');
    if (offset < 6) assert.equal(week[offset + 1].kind, 'recovery');
    if (offset < 5) assert.equal(week[offset + 2].kind, 'recovery');
  });

test('late fixture preserves logged session snapshots, including a same-day match', () => {
  const data = noMatch();
  const original = buildTrainingWeek(data, monday, monday)[0];
  data.logs.push(completed(original));
  fixture(data, addDays(monday, 4));
  assert.deepEqual(
    buildTrainingWeek(data, monday, addDays(monday, 2))[0],
    original
  );
  fixture(data, monday);
  const matchSession = buildTrainingWeek(data, monday, monday)[0];
  assert.equal(matchSession.kind, 'match');
  data.logs.push(completed(matchSession, { id: 'match-log' }));
  const restored = normalizeTraining(data);
  assert.equal(restored.logs.length, 2);
  assert.deepEqual(restored.logs[0].session, original);
});

test('Sunday match protects next Monday and Tuesday', () => {
  const data = noMatch();
  fixture(data, addDays(monday, -1));
  const week = buildTrainingWeek(data, monday, monday);
  assert.equal(week[0].kind, 'recovery');
  assert.equal(week[1].kind, 'recovery');
});

test('next Monday fixture protects this weekend across week boundary', () => {
  const data = noMatch();
  fixture(data, addDays(monday, 7));
  const week = buildTrainingWeek(data, monday, monday);
  assert.equal(week[5].kind, 'skills');
  assert.equal(week[6].kind, 'primer');
});

test('multiple fixtures reserve all match running and prevent additional impact', () => {
  const data = noMatch();
  data.preferences.allowRunning = true;
  data.preferences.allowJumping = true;
  fixture(data, addDays(monday, 3));
  fixture(data, addDays(monday, 6));
  data.checkIns = [{ date: monday, energy: 'fresh', shinPain: 'none' }];
  const week = buildTrainingWeek(data, monday, monday);
  assert.equal(week.filter((s) => s.kind === 'match').length, 2);
  assert.ok(
    week
      .filter((s) => s.kind !== 'match')
      .every((s) => s.runningMinutes === 0 && !s.impact)
  );
});

test('impact requires both enabled preferences and a pain-free daily check-in', () => {
  const data = noMatch();
  data.preferences.allowRunning = true;
  data.preferences.allowJumping = true;
  assert.equal(buildTrainingWeek(data, monday, monday)[0].impact, false);
  data.checkIns = [{ date: monday, energy: 'fresh', shinPain: 'none' }];
  assert.equal(buildTrainingWeek(data, monday, monday)[0].impact, true);
  data.checkIns[0].shinPain = 'mild';
  const week = buildTrainingWeek(data, monday, monday);
  assert.ok(week.slice(0, 3).every((s) => s.kind === 'recovery' && !s.impact));
});

test('painful match remains scheduled with explicit no-clearance advice', () => {
  const data = noMatch();
  fixture(data, monday);
  data.checkIns = [{ date: monday, energy: 'okay', shinPain: 'painful' }];
  assert.match(
    buildTrainingWeek(data, monday, monday)[0].reason,
    /not clearance to play/
  );
});

test('tired readiness and hard-session feedback trigger recovery', () => {
  const data = noMatch();
  data.checkIns = [{ date: monday, energy: 'tired', shinPain: 'none' }];
  assert.equal(buildTrainingWeek(data, monday, monday)[0].kind, 'recovery');
  data.checkIns = [];
  data.logs = [
    completed(buildTrainingWeek(data, monday, monday)[0], { effort: 9 })
  ];
  assert.equal(
    buildTrainingWeek(data, monday, addDays(monday, 1))[1].kind,
    'recovery'
  );
});

test('running minutes and impact days count logged work before planning more', () => {
  const data = noMatch();
  data.preferences.allowRunning = true;
  data.preferences.allowJumping = true;
  data.preferences.weeklyRunMinutes = 1;
  data.checkIns = [{ date: monday, energy: 'fresh', shinPain: 'none' }];
  assert.equal(buildTrainingWeek(data, monday, monday)[0].runningMinutes, 0);
  data.preferences.weeklyRunMinutes = 60;
  data.preferences.maxImpactDays = 1;
  fixture(data, addDays(monday, 6), 20);
  assert.equal(buildTrainingWeek(data, monday, monday)[0].impact, false);
});

test('progress increases strength repetitions only after manageable sessions', () => {
  const data = noMatch();
  const base = buildTrainingWeek(data, monday, monday)[0];
  for (const days of [-12, -9, -6, -3]) {
    const date = addDays(monday, days);
    data.logs.push(completed({ ...base, date }, { id: date, date }));
  }
  assert.equal(getTrainingProgress(data, monday).mode, 'build');
  assert.ok(
    buildTrainingWeek(data, monday, monday)[0].drills.some((d) =>
      d.dose.includes('× 9')
    )
  );
  data.logs[3].effort = 9;
  data.logs[3].date = addDays(monday, -1);
  assert.equal(getTrainingProgress(data, monday).mode, 'ease');
});

test('skipped match does not impose post-match recovery; skipped workout adds no load', () => {
  const data = noMatch();
  fixture(data, addDays(monday, -1));
  const prior = buildTrainingWeek(
    data,
    addDays(monday, -7),
    addDays(monday, -7)
  )[6];
  data.logs = [
    completed(prior, { status: 'skipped', minutes: 0, runningMinutes: 0 })
  ];
  assert.equal(buildTrainingWeek(data, monday, monday)[0].kind, 'strengthA');
});

test('calendar math handles Sunday, year rollover and leap days', () => {
  assert.equal(getWeekStart('2026-10-25'), monday);
  assert.equal(getWeekStart('2027-01-01'), '2026-12-28');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

const nutrient = (value: number, id = 1008, unit = 'KCAL') => ({
  nutrientId: id,
  value,
  unitName: unit
});
const rawFood = (extra = {}) => ({
  fdcId: 123,
  description: 'Test food',
  foodNutrients: [nutrient(200)],
  ...extra
});
test('calories scale per 100g, never mislabeled as a 30g serving', () => {
  const [food] = normalizeUsdaFoods({
    foods: [rawFood({ servingSize: 30, servingSizeUnit: 'g' })]
  });
  assert.equal(food.caloriesPer100, 200);
  assert.equal(portionCalories(food, 30), 60);
  assert.equal(portionCalories(food, 150), 300);
});
test('energy units, Atwater nutrients, zero calories and missing energy are handled correctly', () => {
  const foods = normalizeUsdaFoods({
    foods: [
      rawFood({ foodNutrients: [nutrient(100, 1062, 'kJ')] }),
      rawFood({ fdcId: 124, foodNutrients: [nutrient(0)] }),
      rawFood({
        fdcId: 125,
        foodNutrients: [nutrient(100), nutrient(110, 2048)]
      }),
      rawFood({ fdcId: 126, foodNutrients: [nutrient(NaN)] })
    ]
  });
  assert.equal(foods.length, 2);
  assert.equal(foods[0].caloriesPer100, 0);
  assert.equal(foods[1].caloriesPer100, 110);
});
test('volume servings stay ml and household units are not guessed', () => {
  const [ml, unknown] = normalizeUsdaFoods({
    foods: [
      rawFood({ servingSize: 250, servingSizeUnit: 'mL' }),
      rawFood({ fdcId: 124, servingSize: 1, servingSizeUnit: 'cup' })
    ]
  });
  assert.equal(ml.unit, 'ml');
  assert.equal(portionCalories(ml, ml.servingAmount!), 500);
  assert.equal(unknown.servingAmount, null);
});

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  },
  configurable: true
});
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  configurable: true
});

test('search uses live USDA request shape, caches responses and reuses them offline', async () => {
  storage.clear();
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls++;
    assert.match(String(url), /api.nal.usda.gov/);
    assert.match(String(url), /api_key=DEMO_KEY/);
    assert.match(String(url), /query=rice/);
    return Response.json({ foods: [rawFood()] });
  };
  try {
    assert.equal((await searchUsdaFoods(' Rice ')).cached, false);
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: false },
      configurable: true
    });
    assert.equal((await searchUsdaFoods('rice')).cached, true);
    assert.equal(calls, 1);
    await assert.rejects(searchUsdaFoods('beans'), /offline/);
  } finally {
    globalThis.fetch = original;
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true
    });
  }
});
test('search explains rate limiting, network failures, empty results and invalid payloads', async () => {
  storage.clear();
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('', { status: 429 });
    await assert.rejects(searchUsdaFoods('limit'), /limit/);
    globalThis.fetch = async () => {
      throw new TypeError('network');
    };
    await assert.rejects(searchUsdaFoods('error'), /connection/);
    globalThis.fetch = async () => Response.json({ foods: [] });
    assert.equal((await searchUsdaFoods('nothing')).foods.length, 0);
    globalThis.fetch = async () => Response.json({ unexpected: true });
    await assert.rejects(searchUsdaFoods('invalid'));
  } finally {
    globalThis.fetch = original;
  }
});
test('aborted searches never populate the cache', async () => {
  storage.clear();
  const original = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = async (_url, options) =>
    new Promise((_resolve, reject) =>
      options!.signal!.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError'))
      )
    );
  try {
    const request = searchUsdaFoods('abort', controller.signal);
    controller.abort();
    await assert.rejects(request);
    assert.equal(storage.size, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('Worker validates input, returns proper energy units, rejects disallowed origins, and handles outages', async () => {
  const env = {
    USDA_API_KEY: 'test-only',
    ALLOWED_ORIGIN: 'https://example.com'
  };
  const req = (body: unknown, origin = 'https://example.com') =>
    new Request('https://worker.example', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body)
    });
  const original = globalThis.fetch;
  try {
    assert.equal((await worker.fetch(req(null), env)).status, 400);
    assert.equal(
      (await worker.fetch(req({ query: 'rice' }, 'https://other.example'), env))
        .status,
      403
    );
    globalThis.fetch = async () =>
      Response.json({
        foods: [rawFood({ servingSize: 30, servingSizeUnit: 'g' })]
      });
    const response = await worker.fetch(req({ query: 'rice' }), env);
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      'https://example.com'
    );
    assert.equal((await response.json()).foods[0].caloriesPer100, 200);
    globalThis.fetch = async () => {
      throw new Error('upstream');
    };
    assert.equal((await worker.fetch(req({ query: 'rice' }), env)).status, 502);
  } finally {
    globalThis.fetch = original;
  }
});

test('removing a fixture cannot erase recovery after a logged match', () => {
  const data = noMatch();
  const sunday = addDays(monday, -1);
  fixture(data, sunday);
  const match = buildTrainingWeek(
    data,
    addDays(monday, -7),
    addDays(monday, -7)
  )[6];
  data.logs = [completed(match)];
  data.matches = [];
  const week = buildTrainingWeek(data, monday, monday);
  assert.equal(week[0].kind, 'recovery');
  assert.equal(week[1].kind, 'recovery');
});

test('unlogged past workouts are not fabricated when replanning midweek', () => {
  const data = noMatch();
  const week = buildTrainingWeek(data, monday, addDays(monday, 2));
  assert.equal(week[0].title, 'No session logged');
  assert.equal(week[1].title, 'No session logged');
  assert.equal(week[2].kind, 'strengthA');
});

test('unknown Thursday fixture prevents Tuesday make-up strength or running', () => {
  const data = createTrainingData();
  data.preferences.allowRunning = true;
  data.preferences.allowJumping = true;
  data.checkIns = [
    { date: addDays(monday, 1), energy: 'fresh', shinPain: 'none' }
  ];
  const session = buildTrainingWeek(data, monday, addDays(monday, 1))[1];
  assert.equal(session.kind, 'endurance');
  assert.equal(session.impact, false);
});
