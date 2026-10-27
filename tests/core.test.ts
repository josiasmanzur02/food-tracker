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
import { addDays } from '../src/utils/dates';
import { createEmptyAppData, migrateData, saveActivity, getAppData, exportData, importData, resetData } from '../src/services/storage';
import { createAppleHealthData, normalizeAppleHealth, parseHealthSnapshot, readAppleHealth, requestAppleHealthAccess, supportsAppleHealth } from '../src/services/appleHealth';
import {
  normalizeUsdaFoods,
  portionCalories
} from '../src/services/foodNutrition';
import { searchUsdaFoods } from '../src/services/usdaFoodSearch';
import worker from '../worker/src/index.js';
import type { ActivityDay, HealthSnapshot, TrainingData, TrainingSession, WorkoutLog } from '../src/types';

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
