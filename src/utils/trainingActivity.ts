import type { HealthSnapshot, HealthWorkout, SessionKind, TrainingData, TrainingSession, WorkoutLog } from '../types';
import { addDays } from './dates';

export type WorkoutCategory = 'match' | 'running' | 'conditioning' | 'strength' | 'other';

export function isStrength(kind: SessionKind): boolean {
  return kind === 'strengthA' || kind === 'strengthB' || kind === 'strength';
}

export function healthWorkoutCategory(workout: HealthWorkout): WorkoutCategory {
  switch (workout.activity) {
    case 'soccer': case 'americanFootball': case 'australianFootball': case 'rugby': return 'match';
    case 'running': return 'running';
    case 'walking': case 'hiking': case 'cycling': case 'swimming': return 'conditioning';
    case 'functionalStrengthTraining': case 'traditionalStrengthTraining': return 'strength';
    default: return 'other';
  }
}

export interface TrainingLoadSession {
  date: string;
  minutes: number;
  runningMinutes: number;
  impact: boolean;
  match: boolean;
  strength: boolean;
  endurance: boolean;
  manualLog?: WorkoutLog;
  healthWorkouts: HealthWorkout[];
}

export interface ReconciledHealthWorkout {
  workout: HealthWorkout;
  category: WorkoutCategory;
  logId: string | null;
  automatic: boolean;
}

export interface TrainingActivity {
  sessions: TrainingLoadSession[];
  healthWorkouts: ReconciledHealthWorkout[];
}

function compatible(log: WorkoutLog, category: WorkoutCategory): boolean {
  if (category === 'match') return log.session.kind === 'match';
  if (category === 'strength') return isStrength(log.session.kind);
  if (category === 'running') return log.session.kind === 'endurance' && log.runningMinutes > 0;
  if (category === 'conditioning') return log.session.kind === 'endurance' && log.runningMinutes === 0;
  return false;
}

export function canLinkHealthWorkout(log: WorkoutLog, workout: HealthWorkout): boolean {
  return log.status === 'completed' && log.date === workout.date &&
    (compatible(log, healthWorkoutCategory(workout)) || (workout.activity === 'running' && log.runningMinutes > 0));
}

/** A derived view: refreshes and Health deletions never rewrite manual history or feedback. */
export function getTrainingActivity(data: TrainingData, snapshot: HealthSnapshot | null | undefined, today: string): TrainingActivity {
  const manual = data.logs.filter((log) => log.status === 'completed');
  const seen = new Set<string>();
  const workouts = (snapshot?.workouts ?? []).filter((workout) => {
    if (seen.has(workout.id) || workout.date > today || workout.minutes <= 0 ||
      workout.date < snapshot!.startDate || workout.date > snapshot!.endDate ||
      Date.parse(workout.end) > Date.parse(snapshot!.syncedAt)) return false;
    seen.add(workout.id);
    return true;
  }).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  const overrides = new Map((data.healthLinks ?? []).map((link) => [link.workoutId, link.logId]));
  // Explicit links reserve their logs before automatic matching runs.
  const usedLogs = new Set(workouts.flatMap((workout) => {
    const logId = overrides.get(workout.id);
    return logId && manual.some((log) => log.id === logId && log.date === workout.date) ? [logId] : [];
  }));
  const healthWorkouts: ReconciledHealthWorkout[] = [];
  for (const workout of workouts) {
    const category = healthWorkoutCategory(workout);
    if (overrides.has(workout.id)) {
      const logId = overrides.get(workout.id);
      const log = manual.find((item) => item.id === logId && item.date === workout.date);
      healthWorkouts.push({ workout, category, logId: log?.id ?? null, automatic: false });
      continue;
    }
    const candidates = manual.filter((log) => !usedLogs.has(log.id) && log.date === workout.date &&
      compatible(log, category) && Math.abs(log.minutes - workout.minutes) <= Math.max(5, workout.minutes * 0.2))
      .sort((a, b) => Math.abs(a.minutes - workout.minutes) - Math.abs(b.minutes - workout.minutes));
    // Without a start time on manual logs, equally plausible matches need a user choice.
    let match = candidates.length === 1 || (candidates.length > 1 &&
      Math.abs(candidates[0].minutes - workout.minutes) < Math.abs(candidates[1].minutes - workout.minutes))
      ? candidates[0] : undefined;
    if (match && workouts.some((other) => other.id !== workout.id && !overrides.has(other.id) &&
      !healthWorkouts.some((entry) => entry.workout.id === other.id) && other.date === workout.date &&
      healthWorkoutCategory(other) === category &&
      Math.abs(other.minutes - match!.minutes) <= Math.abs(workout.minutes - match!.minutes))) {
      match = undefined;
    }
    if (match) usedLogs.add(match.id);
    healthWorkouts.push({ workout, category, logId: match?.id ?? null, automatic: true });
  }
  const sessions: TrainingLoadSession[] = manual.map((log) => ({
    date: log.date, minutes: log.minutes, runningMinutes: log.runningMinutes,
    impact: log.session.impact || log.runningMinutes > 0, match: log.session.kind === 'match',
    strength: isStrength(log.session.kind), endurance: log.session.kind === 'endurance',
    manualLog: log, healthWorkouts: []
  }));
  for (const item of healthWorkouts) {
    const { workout, category } = item;
    let session = sessions.find((entry) => entry.manualLog?.id === item.logId);
    if (!session) {
      session = { date: workout.date, minutes: 0, runningMinutes: 0, impact: false,
        match: false, strength: false, endurance: false, healthWorkouts: [] };
      sessions.push(session);
    }
    session.healthWorkouts.push(workout);
    session.minutes = Math.max(session.manualLog?.minutes ?? 0,
      session.healthWorkouts.reduce((sum, entry) => sum + entry.minutes, 0));
    session.runningMinutes = Math.max(session.manualLog?.runningMinutes ?? 0,
      session.healthWorkouts.reduce((sum, entry) =>
        sum + (['running', 'match'].includes(healthWorkoutCategory(entry)) ? entry.minutes : 0), 0));
    session.impact ||= category === 'running' || category === 'match';
    session.match ||= category === 'match';
    session.strength ||= category === 'strength';
    session.endurance ||= category === 'running' || category === 'conditioning';
  }
  return { sessions, healthWorkouts };
}

/** Shared by the planner and its budget display, including actual played time in place of fixtures. */
export function getTrainingWeekLoad(data: TrainingData, weekStart: string, today: string, snapshot?: HealthSnapshot | null) {
  const activity = getTrainingActivity(data, snapshot, today);
  const end = addDays(weekStart, 6);
  const completed = activity.sessions.filter((session) => session.date >= weekStart && session.date <= end);
  const reservedMatches = data.matches.filter((match) => match.date >= weekStart && match.date <= end &&
    !data.logs.some((log) => log.date === match.date && log.session.kind === 'match') &&
    !completed.some((session) => session.date === match.date && session.match));
  const impactDates = new Set([
    ...completed.filter((session) => session.impact).map((session) => session.date),
    ...reservedMatches.map((match) => match.date)
  ]);
  return {
    activity, completed, reservedMatches, impactDates,
    runningMinutes: completed.reduce((sum, session) => sum + session.runningMinutes, 0),
    reservedRunningMinutes: reservedMatches.reduce((sum, match) => sum + match.plannedMinutes, 0)
  };
}

export function healthDaySession(date: string, sessions: TrainingLoadSession[]): TrainingSession {
  const workouts = sessions.flatMap((session) => session.healthWorkouts);
  const match = sessions.some((session) => session.match);
  const strength = sessions.some((session) => session.strength);
  const endurance = sessions.some((session) => session.endurance);
  return {
    date, kind: match ? 'match' : strength ? 'strength' : endurance ? 'endurance' : 'recovery',
    title: workouts.map((workout) => workout.name).join(' + '),
    minutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
    runningMinutes: sessions.reduce((sum, session) => sum + session.runningMinutes, 0),
    impact: sessions.some((session) => session.impact),
    intensity: 'easy', // Not displayed for completed Health sessions; no effort is inferred.
    reason: 'Completed activity from Apple Health is included in your plan. No extra session is added today. Add your own effort and shin feedback to help adjust upcoming sessions.',
    drills: [], source: 'appleHealth', healthWorkoutIds: workouts.map((workout) => workout.id)
  };
}
