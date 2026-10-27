import type { TrainingData, TrainingSession, WorkoutLog } from '../types';
import { getDateKey, parseDateKey } from '../utils/dates';

export function createTrainingData(): TrainingData {
  return {
    preferences: {
      level: 'returning',
      kettlebellsLb: [15, 20],
      weeklyRunMinutes: 60,
      maxImpactDays: 2,
      allowRunning: false,
      allowJumping: false
    },
    matches: [],
    weeks: [],
    checkIns: [],
    logs: [],
    healthLinks: []
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}
function items(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}
function number(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}
function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, 1000) : fallback;
}
export function validTrainingDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    getDateKey(parseDateKey(value)) === value
  );
}
function pain(value: unknown): 'none' | 'mild' | 'painful' {
  return value === 'none' || value === 'mild' ? value : 'painful';
}
function byDate<T extends { date: string }>(values: T[]): T[] {
  return [...new Map(values.map((value) => [value.date, value])).values()].sort(
    (a, b) => a.date.localeCompare(b.date)
  );
}
const kinds = [
  'strengthA',
  'strengthB',
  'strength',
  'endurance',
  'skills',
  'primer',
  'recovery',
  'match',
  'rest'
];

function normalizeSession(
  value: unknown,
  date: string
): TrainingSession | null {
  const v = record(value);
  if (!kinds.includes(String(v.kind)) || typeof v.title !== 'string')
    return null;
  return {
    date,
    kind: v.kind as TrainingSession['kind'],
    title: text(v.title),
    minutes: number(v.minutes, 0, 0, 240),
    runningMinutes: number(v.runningMinutes, 0, 0, 180),
    impact: v.impact === true,
    intensity:
      v.intensity === 'hard' || v.intensity === 'moderate'
        ? v.intensity
        : 'easy',
    reason: text(v.reason),
    drills: items(v.drills)
      .slice(0, 20)
      .map((d) => ({
        name: text(d.name),
        dose: text(d.dose),
        cue: text(d.cue)
      }))
  };
}

export function normalizeTraining(value: unknown): TrainingData {
  const defaults = createTrainingData();
  const v = record(value);
  const p = record(v.preferences);
  const weights = Array.isArray(p.kettlebellsLb)
    ? p.kettlebellsLb
        .filter(
          (w): w is number =>
            typeof w === 'number' && Number.isFinite(w) && w > 0 && w <= 150
        )
        .slice(0, 8)
    : defaults.preferences.kettlebellsLb;
  const logs = items(v.logs).flatMap((log): WorkoutLog[] => {
    if (
      !validTrainingDate(log.date) ||
      typeof log.id !== 'string' ||
      !['completed', 'skipped'].includes(String(log.status))
    )
      return [];
    const session = normalizeSession(log.session, log.date);
    if (!session) return [];
    const minutes = number(log.minutes, 0, 0, 240);
    return [
      {
        id: text(log.id),
        date: log.date,
        status: log.status as WorkoutLog['status'],
        session,
        minutes,
        runningMinutes: number(log.runningMinutes, 0, 0, minutes),
        effort: number(log.effort, 5, 1, 10),
        shinPain: pain(log.shinPain),
        createdAt: text(log.createdAt)
      }
    ];
  });
  return {
    preferences: {
      level: p.level === 'regular' ? 'regular' : 'returning',
      kettlebellsLb: weights.length
        ? [...new Set(weights)].sort((a, b) => a - b)
        : [15, 20],
      weeklyRunMinutes: number(p.weeklyRunMinutes, 60, 0, 300),
      maxImpactDays: Math.round(number(p.maxImpactDays, 2, 1, 3)),
      allowRunning: p.allowRunning === true,
      allowJumping: p.allowJumping === true
    },
    matches: byDate(
      items(v.matches)
        .filter((m) => validTrainingDate(m.date) && typeof m.id === 'string')
        .map((m) => ({
          id: text(m.id),
          date: m.date as string,
          label: text(m.label, 'Football match'),
          kickoff:
            typeof m.kickoff === 'string' &&
            /^([01]\d|2[0-3]):[0-5]\d$/.test(m.kickoff)
              ? m.kickoff
              : '19:00',
          plannedMinutes: number(m.plannedMinutes, 60, 1, 120)
        }))
    ),
    weeks: [
      ...new Map(
        items(v.weeks)
          .filter(
            (w) =>
              validTrainingDate(w.weekStart) &&
              parseDateKey(w.weekStart).getDay() === 1
          )
          .map((w) => [
            w.weekStart,
            {
              weekStart: w.weekStart as string,
              matchStatus:
                w.matchStatus === 'none'
                  ? ('none' as const)
                  : ('unknown' as const)
            }
          ])
      ).values()
    ],
    checkIns: byDate(
      items(v.checkIns)
        .filter((c) => validTrainingDate(c.date))
        .map((c) => ({
          date: c.date as string,
          energy:
            c.energy === 'fresh' || c.energy === 'tired' ? c.energy : 'okay',
          shinPain: pain(c.shinPain)
        }))
    ),
    healthLinks: [...new Map(items(v.healthLinks)
      .filter((link) => typeof link.workoutId === 'string' && link.workoutId.length > 0 &&
        (link.logId === null || typeof link.logId === 'string'))
      .map((link) => [text(link.workoutId), { workoutId: text(link.workoutId),
        logId: link.logId === null ? null : text(link.logId) }])).values()],
    logs: [
      ...new Map(
        logs.map((log) => [
          `${log.date}:${log.session.kind === 'match' ? 'match' : 'workout'}`,
          log
        ])
      ).values()
    ].sort((a, b) => a.date.localeCompare(b.date))
  };
}
