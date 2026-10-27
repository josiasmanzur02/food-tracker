import { useState } from 'react';
import type {
  FootballMatch,
  AppleHealthData,
  UnitSystem,
  ShinPain,
  TrainingData,
  TrainingSession,
  WorkoutLog
} from '../types';
import { AppHeader } from '../components/AppHeader';
import { ActivitySummary } from '../components/ActivitySummary';
import type { AppleHealthController } from '../hooks/useAppleHealth';
import {
  MatchSheet,
  TrainingSettingsSheet,
  WorkoutLogSheet
} from '../components/TrainingSheets';
import { addDays, formatDate, formatDateShort } from '../utils/dates';
import {
  buildTrainingWeek,
  getTrainingProgress,
  getWeekStart
} from '../utils/training';
import { getTrainingWeekLoad, isStrength } from '../utils/trainingActivity';

interface TrainingPageProps {
  data: TrainingData;
  today: string;
  onChange: (data: TrainingData, message: string) => void;
}

function Readiness({ data, today, onChange }: TrainingPageProps) {
  const existing = data.checkIns.find((c) => c.date === today);
  const [energy, setEnergy] = useState(existing?.energy ?? 'okay');
  const [shinPain, setShinPain] = useState<ShinPain | ''>(
    existing?.shinPain ?? ''
  );
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!shinPain) return;
        onChange(
          {
            ...data,
            checkIns: [
              ...data.checkIns.filter((c) => c.date !== today),
              { date: today, energy, shinPain }
            ]
          },
          'Check-in saved. Your plan has adapted.'
        );
      }}
    >
      <div>
        <p className="section-label">Daily check-in</p>
        <h2>How are you feeling?</h2>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Energy today</span>
          <select
            value={energy}
            onChange={(e) => setEnergy(e.target.value as typeof energy)}
          >
            <option value="fresh">Fresh</option>
            <option value="okay">Okay</option>
            <option value="tired">Tired / sore</option>
          </select>
        </label>
        <label className="field">
          <span>Shins today</span>
          <select
            value={shinPain}
            onChange={(e) => setShinPain(e.target.value as ShinPain)}
            required
          >
            <option value="">Choose a check-in</option>
            <option value="none">No pain</option>
            <option value="mild">Mild discomfort</option>
            <option value="painful">Painful / worsening</option>
          </select>
        </label>
      </div>
      <button type="submit" className="button button--secondary">
        {existing ? 'Update check-in' : 'Adapt today’s workout'}
      </button>
    </form>
  );
}

export function TrainingPage({ data, today, onChange, activity, health, unitSystem }: TrainingPageProps & {
  activity: AppleHealthData; health: AppleHealthController; unitSystem: UnitSystem;
}) {
  const [weekStart, setWeekStart] = useState(getWeekStart(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [matchEditor, setMatchEditor] = useState<{
    existing?: FootballMatch;
  } | null>(null);
  const [logging, setLogging] = useState<TrainingSession | null>(null);
  const end = addDays(weekStart, 6);
  const sessions = buildTrainingWeek(data, weekStart, today, activity.snapshot);
  const load = getTrainingWeekLoad(data, weekStart, today, activity.snapshot);
  const selected = sessions.find((s) => s.date === selectedDate) ?? sessions[0];
  const matches = data.matches.filter(
    (m) => m.date >= weekStart && m.date <= end
  );
  const weekStatus =
    data.weeks.find((w) => w.weekStart === weekStart)?.matchStatus ?? 'unknown';
  const weekLogs = data.logs.filter(
    (l) => l.date >= weekStart && l.date <= end
  );
  const logFor = (session: TrainingSession) =>
    session.source === 'appleHealth' ? undefined : weekLogs.find(
      (l) =>
        l.date === session.date &&
        (l.session.kind === 'match') === (session.kind === 'match')
    );
  const selectedLog = logFor(selected);
  const progress = getTrainingProgress(data, addDays(today, 1), activity.snapshot, today);
  const running = load.runningMinutes;
  const unloggedMatchMinutes = load.reservedMatches
    .filter((m) => m.date < today)
    .reduce((sum, m) => sum + m.plannedMinutes, 0);
  const plannedRunning =
    sessions
      .filter((s) => s.date >= today && s.source !== 'appleHealth' && !logFor(s))
      .reduce((sum, s) => sum + s.runningMinutes, 0) + unloggedMatchMinutes;
  const impactDays = new Set([
    ...load.impactDates,
    ...sessions
      .filter((s) => s.date >= today && s.source !== 'appleHealth' && s.impact && !logFor(s))
      .map((s) => s.date),
  ]).size;
  const strengthCount = sessions.filter(
    (s) => isStrength(s.kind)
  ).length;
  const unknown = matches.length === 0 && weekStatus === 'unknown';

  function moveWeek(amount: number) {
    const date = addDays(weekStart, amount * 7);
    setWeekStart(date);
    setSelectedDate(date);
  }
  function saveLog(log: WorkoutLog) {
    onChange(
      {
        ...data,
        logs: [
          ...data.logs.filter(
            (l) =>
              l.date !== log.date ||
              (l.session.kind === 'match') !== (log.session.kind === 'match')
          ),
          log
        ],
        healthLinks: logging?.healthWorkoutIds?.length ? [
          ...data.healthLinks.filter((link) => !logging.healthWorkoutIds!.includes(link.workoutId)),
          ...logging.healthWorkoutIds.map((workoutId) => ({ workoutId, logId: log.id }))
        ] : data.healthLinks
      },
      'Session saved. Upcoming workouts updated.'
    );
    setLogging(null);
  }
  function skipSession() {
    saveLog({
      id: crypto.randomUUID(),
      date: selected.date,
      status: 'skipped',
      session: selected,
      minutes: 0,
      runningMinutes: 0,
      effort: 1,
      shinPain: 'none',
      createdAt: new Date().toISOString()
    });
  }

  return (
    <div className="page training-page">
      <AppHeader
        eyebrow="Movement & football performance"
        title="Activity"
        subtitle="Your daily movement, workouts and football training."
        action={
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setSettingsOpen(true)}
          >
            Preferences
          </button>
        }
      />
      <ActivitySummary data={activity} health={health} today={today} unitSystem={unitSystem}
        training={data} trainingActivity={load.activity} onTrainingChange={onChange} />
      <section className="training-intro card">
        <div>
          <span className="pill">Shin-aware plan</span>
          <h2>Build the athlete, protect the recovery.</h2>
          <p className="supporting-copy">
            Speed foundations, ball control, endurance and kettlebell strength.
            Your {data.preferences.kettlebellsLb.join(' & ')} lb bells are built
            into the week.
          </p>
        </div>
        <div className="training-focus" aria-label="Training goals">
          <span>Speed</span>
          <span>Ball skills</span>
          <span>Endurance</span>
          <span>Jump strength</span>
        </div>
      </section>
      <div className="training-week-toolbar">
        <button
          type="button"
          className="icon-button"
          aria-label="Previous week"
          onClick={() => moveWeek(-1)}
        >
          ←
        </button>
        <div>
          <p className="section-label">Your week</p>
          <strong>
            {formatDateShort(weekStart)} – {formatDateShort(end)}
          </strong>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Next week"
          onClick={() => moveWeek(1)}
        >
          →
        </button>
        <button
          type="button"
          className="button button--inline"
          onClick={() => {
            setWeekStart(getWeekStart(today));
            setSelectedDate(today);
          }}
        >
          Today
        </button>
      </div>
      <section className="card stack" aria-label="Match schedule">
        <div className="card__header">
          <div>
            <p className="section-label">Plan around your game</p>
            <h2>Match schedule</h2>
          </div>
          <button
            type="button"
            className="button button--primary"
            onClick={() => setMatchEditor({})}
          >
            + Match
          </button>
        </div>
        {matches.length ? (
          <div className="stack">
            {matches.map((match) => (
              <div key={match.id} className="match-row">
                <div>
                  <strong>{match.label}</strong>
                  <p className="supporting-copy">
                    {formatDate(match.date, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric'
                    })}{' '}
                    · {match.kickoff} · {match.plannedMinutes} min
                  </p>
                </div>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="button button--inline"
                    onClick={() => setMatchEditor({ existing: match })}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button button--inline"
                    aria-label={`Remove ${match.label} on ${match.date}`}
                    onClick={() =>
                      onChange(
                        {
                          ...data,
                          matches: data.matches.filter((m) => m.id !== match.id)
                        },
                        'Match removed. Check this week’s match status to update the plan.'
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <label className="field">
            <span>This week’s match status</span>
            <select
              value={weekStatus}
              onChange={(e) =>
                onChange(
                  {
                    ...data,
                    weeks: [
                      ...data.weeks.filter((w) => w.weekStart !== weekStart),
                      {
                        weekStart,
                        matchStatus: e.target.value as 'unknown' | 'none'
                      }
                    ]
                  },
                  'Match status saved. Your week has updated.'
                )
              }
            >
              <option value="unknown">
                Not sure yet · keep match nights flexible
              </option>
              <option value="none">Confirmed: no match this week</option>
            </select>
          </label>
        )}
        <p className="supporting-copy">
          {unknown
            ? 'Waiting for a fixture? Wednesday–Sunday stay light for a possible Thursday–Sunday game. Add it when you know.'
            : 'The plan lightens the two days before a match and protects recovery for the two days after. Logged workouts stay in your history.'}
        </p>
        {strengthCount < 2 && (
          <p className="sheet-form__hint">
            {strengthCount} kettlebell session{strengthCount === 1 ? '' : 's'}{' '}
            fits this plan. Recovery and match preparation take priority over
            squeezing in a second.
          </p>
        )}
      </section>
      {weekStart === getWeekStart(today) && (
        <Readiness key={today} data={data} today={today} onChange={onChange} />
      )}
      <section className="training-budget card">
        <div>
          <p className="section-label">Running & playing time</p>
          <p>
            <strong>{Math.round(running)} min completed</strong> + {Math.round(plannedRunning)} min
            reserved
          </p>
        </div>
        <span className="pill">
          {data.preferences.weeklyRunMinutes} min ceiling
        </span>
        <p className="supporting-copy">
          {running + plannedRunning > data.preferences.weeklyRunMinutes
            ? 'Your fixtures or logged running exceed your ceiling. Extra running is removed; reduce playing time with your coach if needed.'
            : 'Match minutes are reserved first. Endurance uses low-impact options; your running limit never increases automatically.'}
        </p>
        {load.activity.healthWorkouts.length > 0 ? <p className="supporting-copy">
          Apple Health runs and football count toward running and impact limits. Recorded walks count as conditioning;
          football activates the same recovery rules as a logged match. Paired manual logs count once.
        </p> : null}
        <p className="sheet-form__hint">
          {unloggedMatchMinutes > 0
            ? `${unloggedMatchMinutes} minutes are held for past, unlogged fixtures. Log or skip those matches to update the budget. `
            : ''}
          {impactDays} of {data.preferences.maxImpactDays} impact days used or
          planned.
          {impactDays > data.preferences.maxImpactDays
            ? ' Your fixtures exceed this limit; discuss playing time and recovery with your coach.'
            : ''}
        </p>
      </section>
      <div className="training-days" aria-label="Choose workout day">
        {sessions.map((s) => {
          const log = logFor(s);
          return (
            <button
              key={s.date}
              type="button"
              aria-pressed={s.date === selected.date}
              aria-label={`${formatDate(s.date)}: ${s.title}${s.source === 'appleHealth' ? ', completed in Apple Health' : log ? `, ${log.status}` : ''}`}
              className={`training-day ${s.date === selected.date ? 'training-day--selected' : ''}`}
              onClick={() => setSelectedDate(s.date)}
            >
              <span>{formatDate(s.date, { weekday: 'short' })}</span>
              <strong>{formatDate(s.date, { day: 'numeric' })}</strong>
              <span
                className={`day-indicator day-indicator--${s.kind}`}
                aria-hidden="true"
              >
                {s.source === 'appleHealth' || log?.status === 'completed'
                  ? '✓'
                  : log?.status === 'skipped'
                    ? '–'
                    : s.kind === 'match'
                      ? '⚽'
                      : '·'}
              </span>
            </button>
          );
        })}
      </div>
      <section
        className="card workout-card stack"
        aria-label="Selected workout"
      >
        <div className="card__header">
          <div>
            <p className="section-label">
              {selected.date === today
                ? 'Today’s session'
                : formatDate(selected.date, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric'
                  })}
            </p>
            <h2>{selected.title}</h2>
          </div>
          <span className="pill">
            {selected.source === 'appleHealth' ? 'Completed · Apple Health' : selectedLog ? selectedLog.status : selected.intensity}
          </span>
        </div>
        <div className="inline-actions">
          <span className="pill pill--muted">
            {selected.minutes ? `${selected.source === 'appleHealth' ? '' : 'About '}${Math.round(selected.minutes)} min` : 'Rest day'}
          </span>
          <span className="pill pill--muted">
            {Math.round(selected.runningMinutes)} min running / playing
          </span>
          <span className="pill pill--muted">
            {selected.impact ? 'Impact day' : 'Low impact'}
          </span>
        </div>
        <p className="coach-reason">{selected.reason}</p>
        {selected.date > today &&
          selected.impact &&
          selected.kind !== 'match' && (
            <p className="sheet-form__hint">
              Provisional: impact depends on a pain-free check-in on the day.
            </p>
          )}
        <ol className="workout-drills">
          {selected.drills.map((d, i) => (
            <li key={`${d.name}-${i}`}>
              <span className="drill-number" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3>{d.name}</h3>
                <p className="drill-dose">{d.dose}</p>
                <p className="supporting-copy">{d.cue}</p>
              </div>
            </li>
          ))}
        </ol>
        {selected.date <= today && selected.title !== 'No session logged' && (
          <div className="workout-actions">
            {selected.source === 'appleHealth' ? (
              <button type="button" className="button button--secondary" onClick={() => setLogging(selected)}>
                Add effort & shin feedback
              </button>
            ) : selectedLog ? (
              <>
                <p className="supporting-copy">
                  {selectedLog.status === 'completed'
                    ? `Logged: ${selectedLog.minutes} min · effort ${selectedLog.effort}/10 · shins: ${selectedLog.shinPain}`
                    : 'Skipped. No catch-up workload is added.'}
                </p>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() =>
                    onChange(
                      {
                        ...data,
                        logs: data.logs.filter((l) => l.id !== selectedLog.id)
                      },
                      'Session log removed. Your plan has updated.'
                    )
                  }
                >
                  Undo log
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => setLogging(selected)}
                >
                  Log {selected.kind === 'match' ? 'match' : 'session'}
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={skipSession}
                >
                  Skip session
                </button>
              </>
            )}
          </div>
        )}
      </section>
      <section className="card stack">
        <div>
          <p className="section-label">All seven days</p>
          <h2>Week at a glance</h2>
        </div>
        <div className="week-list">
          {sessions.map((s) => (
            <button
              type="button"
              key={s.date}
              onClick={() => {
                setSelectedDate(s.date);
                document
                  .querySelector('.workout-card')
                  ?.scrollIntoView({ block: 'start' });
              }}
              className="week-list__row"
            >
              <span>{formatDate(s.date, { weekday: 'short' })}</span>
              <strong>{s.title}</strong>
              <span>
                {s.source === 'appleHealth' || logFor(s)?.status === 'completed' ? '✓' : `${s.minutes}m`}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="card stack">
        <div>
          <p className="section-label">Last 14 days</p>
          <h2>Your training progress</h2>
        </div>
        <div className="training-stats">
          <div>
            <strong>{progress.completed}</strong>
            <span>completed sessions, including Apple Health</span>
          </div>
          <div>
            <strong>{Math.round(progress.minutes)}</strong>
            <span>minutes trained</span>
          </div>
          <div>
            <strong>
              {progress.effort ? progress.effort.toFixed(1) : '—'}
            </strong>
            <span>average manual work effort / 10</span>
          </div>
        </div>
        <p className="supporting-copy">{progress.message}</p>
      </section>
      {data.logs.length > 0 && (
        <section className="card stack">
          <div>
            <p className="section-label">Saved on this device</p>
            <h2>Recent sessions</h2>
          </div>
          {[...data.logs]
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 10)
            .map((log) => (
              <details key={log.id} className="training-history">
                <summary>
                  <strong>{log.session.title}</strong>
                  <span>
                    {formatDateShort(log.date)} ·{' '}
                    {log.status === 'completed'
                      ? `${log.minutes} min · effort ${log.effort}/10`
                      : 'skipped'}
                  </span>
                </summary>
                <div className="stack">
                  <p className="supporting-copy">
                    Original session · {log.runningMinutes} running minutes ·
                    shins: {log.shinPain}
                  </p>
                  {log.session.drills.map((d, i) => (
                    <p key={i} className="supporting-copy">
                      <strong>{d.name}</strong> · {d.dose}
                      <br />
                      {d.cue}
                    </p>
                  ))}
                </div>
              </details>
            ))}
        </section>
      )}
      <details className="card training-notes">
        <summary>How your plan adapts</summary>
        <div className="stack">
          <p className="supporting-copy">
            This is a local rules-based training guide. Session feedback, shin
            symptoms, available equipment and fixtures shape the plan. Weight
            loss alone never unlocks more running. Progress adds a controlled
            strength rep after consistent, manageable sessions; high effort or
            pain reduces workload.
          </p>
          <p className="supporting-copy">
            Synced workouts update the plan automatically. Runs use your running budget and impact-day spacing;
            football adds match recovery; walks and other conditioning, and recorded strength sessions, count toward the week.
            Daily steps, Move calories and standing time never imply an effort rating or unlock extra running.
            Your check-ins and manual effort and shin feedback still control readiness and progression.
          </p>
          <p className="supporting-copy">
            Shin pain pauses running and jumps. Stop activities that hurt; seek
            a qualified clinician’s advice if pain persists, worsens or is
            severe. Match entries record your schedule, not clearance to play.
          </p>
          <p className="supporting-copy">
            Guidance:{' '}
            <a
              href="https://www.nhs.uk/conditions/shin-splints/"
              target="_blank"
              rel="noreferrer"
            >
              NHS: shin splints
            </a>{' '}
            ·{' '}
            <a
              href="https://www.nsca.com/about-us/position-statements/safe-return-to-training/"
              target="_blank"
              rel="noreferrer"
            >
              NSCA: gradual return to training
            </a>{' '}
            ·{' '}
            <a
              href="https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2021.685804/full"
              target="_blank"
              rel="noreferrer"
            >
              Soccer recovery research
            </a>
            . These sources inform the approach; the exact scheduling rules are
            app design choices.
          </p>
        </div>
      </details>
      {settingsOpen && (
        <TrainingSettingsSheet
          preferences={data.preferences}
          onClose={() => setSettingsOpen(false)}
          onSave={(preferences) => {
            onChange({ ...data, preferences }, 'Training preferences saved.');
            setSettingsOpen(false);
          }}
        />
      )}
      {matchEditor && (
        <MatchSheet
          weekStart={weekStart}
          existing={matchEditor.existing}
          onClose={() => setMatchEditor(null)}
          onSave={(match) => {
            onChange(
              {
                ...data,
                matches: [
                  ...data.matches.filter(
                    (m) => m.id !== match.id && m.date !== match.date
                  ),
                  match
                ]
              },
              'Match saved. Your plan has adapted.'
            );
            setMatchEditor(null);
          }}
        />
      )}
      {logging && (
        <WorkoutLogSheet
          session={logging}
          onClose={() => setLogging(null)}
          onSave={saveLog}
        />
      )}
    </div>
  );
}
