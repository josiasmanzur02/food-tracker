import type {
  HealthSnapshot,
  SessionKind,
  TrainingData,
  TrainingDrill,
  TrainingSession
} from '../types';
import { addDays, differenceInDays, getDateKey, parseDateKey } from './dates';
import { getTrainingActivity, getTrainingWeekLoad, healthDaySession, isStrength } from './trainingActivity';

export function getWeekStart(date: string): string {
  return addDays(date, -((parseDateKey(date).getDay() + 6) % 7));
}

export function getTrainingProgress(data: TrainingData, date: string, snapshot?: HealthSnapshot | null, today = getDateKey()) {
  const recent = getTrainingActivity(data, snapshot, today).sessions.filter(
    (session) => session.date < date && session.date >= addDays(date, -14) &&
      session.manualLog?.session.kind !== 'rest'
  );
  // Progression requires the user's own effort feedback. Imported duration never proves readiness.
  const feedback = recent.flatMap((session) => session.manualLog ? [session.manualLog] : []);
  const work = feedback.filter((log) => isStrength(log.session.kind) || log.session.kind === 'endurance');
  const effort = work.length
    ? work.reduce((sum, l) => sum + l.effort, 0) / work.length
    : 0;
  const pain = feedback.some((l) => l.shinPain !== 'none');
  const lastHard = feedback.some(
    (l) => l.date >= addDays(date, -2) && l.effort >= 8
  );
  const mode =
    lastHard || pain
      ? 'ease'
      : work.length >= 4 && effort <= 6
        ? 'build'
        : 'steady';
  return {
    completed: recent.length,
    minutes: recent.reduce((sum, l) => sum + l.minutes, 0),
    effort,
    syncedWorkouts: recent.reduce((sum, session) => sum + session.healthWorkouts.length, 0),
    mode,
    message:
      mode === 'ease'
        ? 'Recent soreness or high effort: fewer strength sets and gentle conditioning.'
        : mode === 'build'
          ? 'You’ve handled recent sessions well. Add one controlled strength rep per set; running stays capped.'
          : 'Build consistency first. Log effort and shin symptoms after each session so the next plan can adapt.'
  };
}

const drill = (name: string, dose: string, cue: string): TrainingDrill => ({
  name,
  dose,
  cue
});

function createSession(
  kind: SessionKind,
  date: string,
  data: TrainingData,
  options: { run: boolean; jump: boolean; reason: string; easy: boolean },
  snapshot?: HealthSnapshot | null,
  today = getDateKey()
): TrainingSession {
  const progress = getTrainingProgress(data, date, snapshot, today);
  const regular = data.preferences.level === 'regular';
  const sets = options.easy || progress.mode === 'ease' ? 1 : regular ? 3 : 2;
  const reps = progress.mode === 'build' ? 9 : 8;
  const light = data.preferences.kettlebellsLb[0];
  const heavy =
    data.preferences.kettlebellsLb[data.preferences.kettlebellsLb.length - 1];
  const kbCue =
    'Use a weight you can control with 2–3 reps left. Rest 60–90 seconds between sets. Stop any painful movement.';
  const ball = drill(
    'Close control + wall passing',
    '3 × 2 min · 1 min rest',
    'Alternate feet for sole rolls, inside/outside touches and first-touch passes. Stay in place or walk; no hard cuts.'
  );
  const warmup = drill(
    'Gentle warm-up',
    '5–8 min',
    'Pain-free walking or easy cycling, shoulder circles and comfortable hip/ankle movements. No jogging required.'
  );
  const cooldown = drill(
    'Cool down',
    '3–5 min',
    'Ease down gradually. Check how your shins feel now and again tomorrow.'
  );
  const session: TrainingSession = {
    date,
    kind,
    title: '',
    minutes: 0,
    runningMinutes: 0,
    impact: false,
    intensity: 'easy',
    reason: options.reason,
    drills: []
  };
  if (kind === 'strengthA' || kind === 'strengthB') {
    session.title =
      kind === 'strengthA'
        ? 'Speed foundations + kettlebells A'
        : 'Upper body + kettlebells B';
    session.minutes = options.easy ? 25 : regular ? 45 : 35;
    session.intensity = options.easy ? 'easy' : 'moderate';
    session.drills = [warmup];
    if (kind === 'strengthA') {
      if (options.run) {
        session.drills.push(
          drill(
            'Controlled accelerations',
            '4 × 10–15 m · walk back + 90 sec rest',
            'Only when pain-free and accustomed to running. Build smoothly to 70–80% effort; stop if pain or technique changes. No all-out sprints.'
          )
        );
        session.runningMinutes = 2;
        session.impact = true;
      } else
        session.drills.push(
          drill(
            'Acceleration posture',
            '2 × 5 slow wall drives / side',
            'Hands on a wall, straight body line; lift one knee at a time without bouncing. Build the positions for future speed work.'
          )
        );
      if (options.jump) {
        session.drills.push(
          drill(
            'Low jump + stick landing',
            '2 × 3 · 60–90 sec rest',
            'Only after a pain-free return to impact. Small two-foot jumps, quiet landing, reset fully. Stop at any shin discomfort.'
          )
        );
        session.impact = true;
      } else
        session.drills.push(
          drill(
            'Jump strength foundation',
            `${sets} × 8 controlled sit-to-stands`,
            'Stand from a stable chair, lower slowly. Keep feet on the ground; use bodyweight and a pain-free range.'
          )
        );
      session.drills.push(
        drill(
          'Kettlebell deadlift',
          `${sets} × ${reps} · up to ${heavy} lb`,
          `Hinge at the hips, keep the bell close and back neutral. ${kbCue}`
        )
      );
      session.drills.push(
        drill(
          'Single-arm floor press',
          `${sets} × ${reps} / side · start with ${light} lb`,
          `Lie on your back, wrist stacked over elbow, press smoothly. ${kbCue}`
        )
      );
      session.drills.push(
        drill(
          'Supported single-arm row',
          `${sets} × ${reps} / side · ${light}–${heavy} lb`,
          `Support the free hand on a sturdy surface. Pull elbow toward hip without twisting. ${kbCue}`
        )
      );
    } else {
      session.drills.push(
        drill(
          'Single-arm floor press',
          `${sets} × ${reps} / side · start with ${light} lb`,
          `Keep elbow about 45° from torso; lower under control. ${kbCue}`
        )
      );
      session.drills.push(
        drill(
          'Supported single-arm row',
          `${sets} × ${reps} / side · ${light}–${heavy} lb`,
          `Keep hips still and pause briefly at the top. ${kbCue}`
        )
      );
      session.drills.push(
        drill(
          'Seated single-arm press',
          `${sets} × 6 / side · up to ${light} lb`,
          'Sit upright on a stable chair; no leaning or leg drive. If too heavy, repeat floor press or use an unloaded reach.'
        )
      );
      session.drills.push(
        drill(
          'Suitcase hold',
          `${sets} × 20–30 sec / side · up to ${heavy} lb`,
          'Stand tall without leaning; breathe normally. Use a seated hold if standing bothers your shins.'
        )
      );
      session.drills.push(
        drill(
          'Dead bug',
          '2 × 6 / side',
          'On your back, gently brace and extend opposite arm and leg without arching.'
        )
      );
    }
    session.drills.push(ball, cooldown);
  } else if (kind === 'endurance') {
    session.title = 'Low-impact engine + ball skills';
    session.minutes = options.easy ? 20 : 30;
    session.intensity = options.easy ? 'easy' : 'moderate';
    session.drills = [
      warmup,
      drill(
        'Easy aerobic conditioning',
        options.easy ? '10 min' : '15–20 min',
        'Choose cycling or swimming if available; otherwise pain-free walking. Keep a conversational pace. If walking hurts, use seated shadow boxing at an easy pace.'
      ),
      ball,
      cooldown
    ];
  } else if (kind === 'skills' || kind === 'primer') {
    session.title =
      kind === 'primer'
        ? 'Match primer · fresh legs'
        : 'First touch + ball control';
    session.minutes = kind === 'primer' ? 15 : 20;
    session.drills = [
      warmup,
      ball,
      drill(
        'Scanning + first touch',
        '3 × 90 sec · 45 sec rest',
        'Look over your shoulder before a wall pass, then receive across your body. Alternate feet. Keep it stationary and relaxed.'
      ),
      cooldown
    ];
  } else if (kind === 'match') {
    const match = data.matches.find((m) => m.date === date)!;
    session.title = match.label || 'Football match';
    session.minutes = match.plannedMinutes;
    session.runningMinutes = match.plannedMinutes;
    session.impact = true;
    session.intensity = 'hard';
    session.drills = [
      drill(
        'Before kickoff',
        '10–15 min with your team',
        'If pain-free, progressively warm up with comfortable movement and ball touches. Tell your coach about any shin symptoms; don’t play through pain.'
      ),
      drill(
        'After the match',
        '5–10 min',
        'Ease down, eat and hydrate normally, then log actual minutes and shin symptoms. Tomorrow is recovery.'
      )
    ];
  } else {
    session.title = kind === 'rest' ? 'Rest + reset' : 'Recovery day';
    session.minutes = kind === 'rest' ? 0 : 15;
    session.drills = [
      drill(
        'Keep it gentle',
        kind === 'rest'
          ? 'Rest, or optional 5–10 min mobility'
          : '10–15 min, optional',
        'Rest or choose comfortable seated mobility, gentle swimming or cycling if pain-free. No running, jumping or cutting. Stop anything that increases symptoms.'
      )
    ];
  }
  return session;
}

/** Conservative calendar rules, not an injury diagnosis or a return-to-play clearance. */
export function buildTrainingWeek(
  data: TrainingData,
  weekStart: string,
  today: string,
  snapshot?: HealthSnapshot | null
): TrainingSession[] {
  const load = getTrainingWeekLoad(data, weekStart, today, snapshot);
  const end = addDays(weekStart, 6);
  const weekMatches = data.matches.filter(
    (m) => m.date >= weekStart && m.date <= end
  );
  const unknown =
    !weekMatches.length &&
    data.weeks.find((w) => w.weekStart === weekStart)?.matchStatus !== 'none';
  const logs = data.logs.filter((l) => l.date >= weekStart && l.date <= end);
  const activeMatches = data.matches.filter(
    (m) =>
      !data.logs.some(
        (l) =>
          l.date === m.date &&
          l.session.kind === 'match' &&
          l.status === 'skipped'
      )
  );
  // A played match still requires recovery even if its calendar fixture is later moved or removed.
  const matchDates = [
    ...new Set([
      ...activeMatches.map((m) => m.date),
      ...load.activity.sessions.filter((session) => session.match).map((session) => session.date)
    ])
  ];
  // Reserve match minutes first, including late-week fixtures, before allocating extra impact.
  let runUsed = load.runningMinutes + load.reservedRunningMinutes;
  const impactDates = new Set(load.impactDates);
  let strengths = 0;
  let lastStrength = load.activity.sessions
    .filter(
      (l) =>
        l.date < weekStart &&
        l.strength
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
  let endurance = 0;
  const sessions: TrainingSession[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const dayLogs = logs.filter((l) => l.date === date);
    const completed = load.completed.filter((session) => session.date === date);
    // Multiple walks or strength records on one day use one weekly session slot.
    if (completed.some((session) => session.strength)) {
      strengths++;
      lastStrength = date;
    }
    if (completed.some((session) => session.endurance)) endurance++;
    const healthOnly = completed.filter((session) => !session.manualLog);
    const log = weekMatches.some((m) => m.date === date)
      ? dayLogs.find((l) => l.session.kind === 'match')
      : dayLogs.find((entry) => entry.status === 'completed') ?? dayLogs[0];
    // Actual Health football takes precedence over an unplayed fixture or a skipped log.
    if (healthOnly.some((session) => session.match) && log?.status !== 'completed') {
      sessions.push(healthDaySession(date, healthOnly));
      continue;
    }
    if (log && (log.status === 'completed' || !healthOnly.length)) {
      sessions.push(log.session); // Preserve the exact completed/skipped workout after replanning.
      continue;
    }
    if (healthOnly.length && !weekMatches.some((match) => match.date === date)) {
      sessions.push(healthDaySession(date, healthOnly));
      continue;
    }
    if (date < today && !weekMatches.some((m) => m.date === date)) {
      sessions.push({
        date,
        kind: 'rest',
        title: 'No session logged',
        minutes: 0,
        runningMinutes: 0,
        impact: false,
        intensity: 'easy',
        reason:
          'Workouts are planned for today onward. Saved sessions and past fixtures stay available; missed days do not add catch-up work.',
        drills: []
      });
      continue;
    }
    const nextMatch = activeMatches
      .filter((m) => m.date >= date)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const prevMatchDate = matchDates
      .filter((d) => d < date)
      .sort((a, b) => b.localeCompare(a))[0];
    const until = nextMatch ? differenceInDays(date, nextMatch.date) : Infinity;
    const since = prevMatchDate
      ? differenceInDays(prevMatchDate, date)
      : Infinity;
    const checkIn = data.checkIns.find((c) => c.date === date);
    const recentPain =
      data.checkIns.some(
        (c) =>
          c.date <= date && c.date >= addDays(date, -2) && c.shinPain !== 'none'
      ) ||
      data.logs.some(
        (l) =>
          l.date < date && l.date >= addDays(date, -2) && l.shinPain !== 'none'
      );
    const tired =
      checkIn?.energy === 'tired' ||
      data.logs.some(
        (l) =>
          l.status === 'completed' &&
          l.date === addDays(date, -1) &&
          l.effort >= 8
      );
    let kind: SessionKind;
    let reason: string;
    if (until === 0) {
      kind = 'match';
      reason = recentPain
        ? 'Shin symptoms reported: this is a scheduled fixture, not clearance to play. Avoid painful impact and discuss participation with your clinician or coach.'
        : 'Your match replaces training today. Planned playing minutes count toward your weekly running limit.';
    } else if (recentPain || tired) {
      kind = 'recovery';
      reason = recentPain
        ? 'Recent shin symptoms: impact is paused. Rest or choose only comfortable, gentle movement.'
        : 'Low energy or a very hard session yesterday: take an easy day.';
    } else if (since <= 2) {
      kind = 'recovery';
      reason =
        'Recovery after your match. Keep the first two days free of hard running, jumping and heavy sessions.';
    } else if (until === 1) {
      kind = 'primer';
      reason =
        'Match tomorrow: a short technical session keeps your legs fresh.';
    } else if (until === 2) {
      kind = 'skills';
      reason =
        'Two days before your match: focus on touch, with no extra hard conditioning.';
    } else if (unknown && i >= 2) {
      kind = i === 2 ? 'primer' : i === 4 || i === 6 ? 'rest' : 'skills';
      reason =
        'Match date unknown: keep Wednesday–Sunday light for a possible Thursday–Sunday evening game. Add the fixture or confirm no match to update the week.';
    } else if (unknown && i === 1) {
      kind = 'endurance';
      reason =
        'A Thursday match is still possible. Use low-impact endurance today instead of making up a missed strength session.';
    } else if (i === 6) {
      kind = 'rest';
      reason = 'A day off to absorb the week’s work.';
    } else if (
      strengths < 2 &&
      (!lastStrength || differenceInDays(lastStrength, date) >= 2)
    ) {
      kind = strengths === 0 ? 'strengthA' : 'strengthB';
      reason =
        strengths === 0
          ? 'Strength and speed foundations early in a safe training window.'
          : 'Second kettlebell session, spaced from your first and clear of match preparation.';
    } else if (
      endurance < 2 &&
      sessions[sessions.length - 1]?.kind !== 'endurance'
    ) {
      kind = 'endurance';
      reason =
        'Build endurance with less impact on your shins. Keep the pace conversational.';
    } else {
      kind = 'skills';
      reason = 'A lighter technical day between demanding sessions.';
    }
    const adjacentImpact = [
      ...impactDates,
      ...load.activity.sessions
        .filter((session) => session.impact)
        .map((l) => l.date)
    ].some((d) => Math.abs(differenceInDays(d, date)) <= 1);
    const canImpact =
      !recentPain &&
      !tired &&
      until >= 3 &&
      since >= 3 &&
      !adjacentImpact &&
      impactDates.size < data.preferences.maxImpactDays &&
      (date !== today || checkIn?.shinPain === 'none');
    const run =
      canImpact &&
      data.preferences.allowRunning &&
      runUsed + 2 <= data.preferences.weeklyRunMinutes;
    const jump =
      canImpact &&
      data.preferences.allowJumping &&
      data.preferences.allowRunning &&
      runUsed < data.preferences.weeklyRunMinutes;
    if (kind === 'strengthA' && !run)
      reason +=
        ' Running is replaced by controlled posture drills until your check-in, impact settings and weekly budget allow it.';
    if (kind === 'strengthA' && !jump)
      reason += ' Jumping is replaced by strength without leaving the ground.';
    const session = createSession(kind, date, data, {
      run,
      jump,
      reason,
      easy: getTrainingProgress(data, date, snapshot, today).mode === 'ease'
    }, snapshot, today);
    sessions.push(session);
    // Missed days do not consume this week’s remaining sessions or create make-up workouts.
    if (date >= today) {
      if (kind === 'strengthA' || kind === 'strengthB') {
        strengths++;
        lastStrength = date;
      }
      if (kind === 'endurance') endurance++;
      if (kind !== 'match') {
        runUsed += session.runningMinutes;
        if (session.impact) impactDates.add(date);
      }
    }
  }
  return sessions;
}
