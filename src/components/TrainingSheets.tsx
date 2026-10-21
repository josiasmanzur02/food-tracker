import { useState } from 'react';
import type {
  FootballMatch,
  ShinPain,
  TrainingPreferences,
  TrainingSession,
  WorkoutLog
} from '../types';
import { addDays, formatDate, getDateKey } from '../utils/dates';
import { getWeekStart } from '../utils/training';
import { ModalShell } from './ModalShell';

export function TrainingSettingsSheet({
  preferences,
  onSave,
  onClose
}: {
  preferences: TrainingPreferences;
  onSave: (value: TrainingPreferences) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(preferences);
  const [weights, setWeights] = useState(preferences.kettlebellsLb.join(', '));
  const [error, setError] = useState('');
  return (
    <ModalShell open title="Training preferences" onClose={onClose}>
      <form
        className="sheet-form"
        onSubmit={(event) => {
          event.preventDefault();
          const kettlebellsLb = weights
            .split(',')
            .map((weight) => Number(weight.trim()));
          if (
            !kettlebellsLb.length ||
            kettlebellsLb.some(
              (weight) =>
                !Number.isFinite(weight) || weight <= 0 || weight > 150
            )
          ) {
            setError(
              'Enter kettlebell weights in pounds, separated by commas.'
            );
            return;
          }
          onSave({
            ...draft,
            kettlebellsLb: [...new Set(kettlebellsLb)].sort((a, b) => a - b)
          });
        }}
      >
        <p className="supporting-copy">
          Start conservatively while managing your shins. Your 15 lb and 20 lb
          kettlebells are ready to use.
        </p>
        <label className="field">
          <span>Training level</span>
          <select
            value={draft.level}
            onChange={(e) =>
              setDraft({
                ...draft,
                level: e.target.value as TrainingPreferences['level']
              })
            }
          >
            <option value="returning">
              Building up / returning to training
            </option>
            <option value="regular">Training consistently</option>
          </select>
        </label>
        <label className="field">
          <span>Kettlebells available (lb)</span>
          <input
            value={weights}
            onChange={(e) => setWeights(e.target.value)}
            placeholder="15, 20"
            required
          />
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Weekly running ceiling (min)</span>
            <input
              type="number"
              min="0"
              max="300"
              step="1"
              value={draft.weeklyRunMinutes}
              onChange={(e) =>
                setDraft({ ...draft, weeklyRunMinutes: Number(e.target.value) })
              }
              required
            />
          </label>
          <label className="field">
            <span>Maximum impact days</span>
            <select
              value={draft.maxImpactDays}
              onChange={(e) =>
                setDraft({ ...draft, maxImpactDays: Number(e.target.value) })
              }
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} per week
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="sheet-form__hint">
          A ceiling, not a target or a medical recommendation. Matches reserve
          their full playing time first. The plan never increases your running
          limit automatically.
        </p>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={draft.allowRunning}
            onChange={(e) =>
              setDraft({
                ...draft,
                allowRunning: e.target.checked,
                allowJumping: e.target.checked && draft.allowJumping
              })
            }
          />
          <span>
            Include controlled running once I’ve recovered enough to resume it.
          </span>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={draft.allowJumping}
            disabled={!draft.allowRunning}
            onChange={(e) =>
              setDraft({ ...draft, allowJumping: e.target.checked })
            }
          />
          <span>
            Include low jumps once I can tolerate impact without symptoms.
          </span>
        </label>
        <p className="sheet-form__hint">
          Today’s running and jumps also require a pain-free check-in. Any
          recent shin pain pauses impact. Don’t exercise through shin pain; seek
          assessment if it persists or worsens.
        </p>
        {error && (
          <p role="alert" className="form-message--error">
            {error}
          </p>
        )}
        <button className="button button--primary" type="submit">
          Save preferences
        </button>
      </form>
    </ModalShell>
  );
}

export function MatchSheet({
  weekStart,
  existing,
  onSave,
  onClose
}: {
  weekStart: string;
  existing?: FootballMatch;
  onSave: (match: FootballMatch) => void;
  onClose: () => void;
}) {
  const today = getDateKey();
  const defaultDate =
    addDays(weekStart, 3) < today && getWeekStart(today) === weekStart
      ? today
      : addDays(weekStart, 3);
  const [draft, setDraft] = useState<FootballMatch>(
    existing ?? {
      id: crypto.randomUUID(),
      date: defaultDate,
      kickoff: '19:00',
      label: 'Football match',
      plannedMinutes: 60
    }
  );
  return (
    <ModalShell
      open
      title={existing ? 'Update match' : 'Add a match'}
      onClose={onClose}
    >
      <form
        className="sheet-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
      >
        <p className="supporting-copy">
          Add it whenever you find out. Upcoming sessions adjust immediately,
          including recovery across weeks.
        </p>
        <div className="match-shortcuts" aria-label="Usual match nights">
          {[3, 4, 5, 6].map((offset) => {
            const date = addDays(weekStart, offset);
            return (
              <button
                key={date}
                className={`button ${draft.date === date ? 'button--primary' : 'button--secondary'}`}
                type="button"
                onClick={() => setDraft({ ...draft, date })}
              >
                {formatDate(date, { weekday: 'short' })}
              </button>
            );
          })}
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Match date</span>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Kickoff (local time)</span>
            <input
              type="time"
              value={draft.kickoff}
              onChange={(e) => setDraft({ ...draft, kickoff: e.target.value })}
              required
            />
          </label>
        </div>
        <label className="field">
          <span>Match name or opponent</span>
          <input
            value={draft.label}
            maxLength={80}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Expected playing minutes</span>
          <input
            type="number"
            min="1"
            max="120"
            value={draft.plannedMinutes}
            onChange={(e) =>
              setDraft({ ...draft, plannedMinutes: Number(e.target.value) })
            }
            required
          />
        </label>
        <p className="sheet-form__hint">
          This time is reserved in your running budget. Log actual playing
          minutes after the game. One fixture per date; saving another replaces
          that date’s fixture.
        </p>
        <button className="button button--primary" type="submit">
          {existing ? 'Update match & plan' : 'Add match & update plan'}
        </button>
      </form>
    </ModalShell>
  );
}

export function WorkoutLogSheet({
  session,
  existing,
  onSave,
  onClose
}: {
  session: TrainingSession;
  existing?: WorkoutLog;
  onSave: (log: WorkoutLog) => void;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState(
    String(existing?.minutes ?? session.minutes)
  );
  const [running, setRunning] = useState(
    String(existing?.runningMinutes ?? session.runningMinutes)
  );
  const [effort, setEffort] = useState(existing?.effort ?? 5);
  const [shinPain, setShinPain] = useState<ShinPain | ''>(
    existing?.shinPain ?? ''
  );
  const [error, setError] = useState('');
  return (
    <ModalShell open title="Log your session" onClose={onClose}>
      <form
        className="sheet-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            !shinPain ||
            !Number.isFinite(Number(minutes)) ||
            !Number.isFinite(Number(running)) ||
            Number(running) > Number(minutes)
          ) {
            setError(
              'Running minutes cannot exceed total minutes. Select how your shins felt.'
            );
            return;
          }
          onSave({
            id: existing?.id ?? crypto.randomUUID(),
            date: session.date,
            status: 'completed',
            session,
            minutes: Number(minutes),
            runningMinutes: Number(running),
            effort,
            shinPain,
            createdAt: existing?.createdAt ?? new Date().toISOString()
          });
        }}
      >
        <h3>{session.title}</h3>
        <p className="supporting-copy">
          {formatDate(session.date)} · Your feedback adjusts upcoming sessions.
        </p>
        <div className="form-grid">
          <label className="field">
            <span>Total minutes</span>
            <input
              type="number"
              min={session.kind === 'rest' ? '0' : '1'}
              max="240"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Running / playing minutes</span>
            <input
              type="number"
              min="0"
              max={minutes || '240'}
              value={running}
              onChange={(e) => setRunning(e.target.value)}
              required
            />
          </label>
        </div>
        <label className="field">
          <span>Effort · {effort}/10</span>
          <input
            type="range"
            min="1"
            max="10"
            value={effort}
            onChange={(e) => setEffort(Number(e.target.value))}
          />
          <span className="sheet-form__hint">
            1 = very easy · 5 = moderate · 10 = maximum
          </span>
        </label>
        <label className="field">
          <span>Shin symptoms during / after</span>
          <select
            value={shinPain}
            onChange={(e) => setShinPain(e.target.value as ShinPain)}
            required
          >
            <option value="">Choose how your shins felt</option>
            <option value="none">No pain</option>
            <option value="mild">Mild discomfort</option>
            <option value="painful">Painful / worsening</option>
          </select>
        </label>
        {shinPain && shinPain !== 'none' && (
          <p className="notice-card">
            Upcoming impact sessions will be paused. Avoid the activity that
            causes pain; get assessed if symptoms persist or worsen.
          </p>
        )}
        {error && (
          <p className="form-message--error" role="alert">
            {error}
          </p>
        )}
        <button className="button button--primary" type="submit">
          Save session
        </button>
      </form>
    </ModalShell>
  );
}
