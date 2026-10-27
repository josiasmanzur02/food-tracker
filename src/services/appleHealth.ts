import type { ActivityDay, AppleHealthData, HealthSnapshot, HealthWorkout } from '../types';
import { getDateKey, parseDateKey } from '../utils/dates';

export function createAppleHealthData(): AppleHealthData {
  return { syncEnabled: false, snapshot: null };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    getDateKey(parseDateKey(value)) === value;
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function quantity(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function day(value: unknown): value is ActivityDay {
  if (!record(value) || !dateKey(value.date) || (value.moveMode !== 'energy' && value.moveMode !== 'time')) return false;
  return ['steps', 'activeEnergyKcal', 'moveMinutes', 'exerciseMinutes', 'standMinutes',
    'standHours', 'moveGoal', 'exerciseGoalMinutes', 'standGoalHours'].every((key) => quantity(value[key]));
}

function workout(value: unknown): value is HealthWorkout {
  return record(value) && typeof value.id === 'string' && value.id.length > 0 && dateKey(value.date) &&
    typeof value.activity === 'string' && typeof value.name === 'string' && value.name.length > 0 &&
    timestamp(value.start) && timestamp(value.end) && Date.parse(value.end) >= Date.parse(value.start) &&
    typeof value.minutes === 'number' && quantity(value.minutes) &&
    quantity(value.distanceMeters) && quantity(value.activeEnergyKcal);
}

/** Validate the entire result before replacing the last successful device snapshot. */
export function parseHealthSnapshot(value: unknown): HealthSnapshot {
  if (!record(value) || !dateKey(value.startDate) || !dateKey(value.endDate) ||
    value.startDate > value.endDate || !timestamp(value.syncedAt) ||
    !Array.isArray(value.days) || !value.days.every(day) ||
    !Array.isArray(value.workouts) || !value.workouts.every(workout)) {
    throw new Error('Apple Health returned an invalid activity summary. Your saved summary was kept.');
  }
  const start = value.startDate;
  const end = value.endDate;
  const days = value.days as ActivityDay[];
  const workouts = value.workouts as HealthWorkout[];
  if (days.some((item) => item.date < start || item.date > end) ||
    workouts.some((item) => item.date < start || item.date > end) ||
    new Set(days.map((item) => item.date)).size !== days.length ||
    new Set(workouts.map((item) => item.id)).size !== workouts.length) {
    throw new Error('Apple Health returned duplicate or out-of-range activity data. Your saved summary was kept.');
  }
  return {
    startDate: start, endDate: end, syncedAt: value.syncedAt,
    days: [...days].sort((a, b) => b.date.localeCompare(a.date)),
    workouts: [...workouts].sort((a, b) => b.start.localeCompare(a.start))
  };
}

export function normalizeAppleHealth(value: unknown): AppleHealthData {
  if (!record(value)) return createAppleHealthData();
  let snapshot: HealthSnapshot | null = null;
  if (value.snapshot) {
    try { snapshot = parseHealthSnapshot(value.snapshot); } catch { /* Discard malformed backup data. */ }
  }
  return { syncEnabled: value.syncEnabled === true, snapshot };
}

interface HealthBridge {
  postMessage(message: { action: 'authorize' | 'read' }): Promise<unknown>;
}

function bridge(): HealthBridge | undefined {
  return (window as Window & {
    webkit?: { messageHandlers?: { appleHealth?: HealthBridge } };
  }).webkit?.messageHandlers?.appleHealth;
}

export function supportsAppleHealth(): boolean {
  return typeof window !== 'undefined' && typeof bridge()?.postMessage === 'function';
}

export async function requestAppleHealthAccess(): Promise<void> {
  const native = bridge();
  if (!native) throw new Error('Automatic Apple Health sync is available in the CalorieTrack iPhone app.');
  await native.postMessage({ action: 'authorize' });
}

export async function readAppleHealth(): Promise<HealthSnapshot> {
  const native = bridge();
  if (!native) throw new Error('Open the CalorieTrack iPhone app to refresh Apple Health.');
  return parseHealthSnapshot(await native.postMessage({ action: 'read' }));
}
