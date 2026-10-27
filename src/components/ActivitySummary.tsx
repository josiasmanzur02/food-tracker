import { useState } from 'react';
import type { AppleHealthData, UnitSystem } from '../types';
import type { AppleHealthController } from '../hooks/useAppleHealth';
import { formatDateShort } from '../utils/dates';

interface Props {
  data: AppleHealthData;
  health: AppleHealthController;
  today: string;
  unitSystem: UnitSystem;
}

function amount(value: number | null | undefined): string {
  return value == null ? '—' : Math.round(value).toLocaleString();
}

function Metric({ label, value, unit, goal, tone }: {
  label: string; value: number | null | undefined; unit: string; goal?: number | null; tone?: string;
}) {
  return (
    <div className={`activity-metric ${tone ? `activity-metric--${tone}` : ''}`}>
      <span>{label}</span>
      <p><strong>{amount(value)}</strong> <span>{unit}</span></p>
      {goal != null && goal > 0 ? <>
        <progress aria-label={`${label} goal`} max={goal} value={value ?? 0} />
        <span>of {amount(goal)} {unit}</span>
      </> : null}
    </div>
  );
}

export function ActivitySummary({ data, health, today, unitSystem }: Props) {
  const [date, setDate] = useState(today);
  const snapshot = data.snapshot;
  const day = snapshot?.days.find((item) => item.date === date);
  const workouts = snapshot?.workouts.filter((item) => item.date === date) ?? [];
  const hasReadings = day && [day.steps, day.activeEnergyKcal, day.moveMinutes, day.exerciseMinutes,
    day.standMinutes, day.standHours].some((value) => value !== null);
  const moveTime = day?.moveMode === 'time';

  return (
    <section className="card stack activity-summary" aria-labelledby="activity-heading" aria-busy={health.busy}>
      <div className="card__header">
        <div>
          <p className="section-label">Apple Health · Fitness</p>
          <h2 id="activity-heading">Your daily activity</h2>
        </div>
        {health.available ? (
          <button className="button button--secondary" type="button" disabled={health.busy}
            onClick={() => void (data.syncEnabled ? health.refresh() : health.connect())}>
            {health.busy ? 'Syncing…' : data.syncEnabled ? 'Refresh' : 'Connect Apple Health'}
          </button>
        ) : <span className="pill">iPhone app required for sync</span>}
      </div>
      {!health.available ? (
        <p className="supporting-copy">Open the CalorieTrack iPhone app to connect Apple Health and see the walks,
          runs and football workouts you record in Fitness, plus your daily movement. Apple Health access is unavailable in a browser.</p>
      ) : !data.syncEnabled ? (
        <p className="supporting-copy">Connect to read your steps, Move, Exercise, Stand and workouts from Apple Health.
          Choose what to share in the permission screen. Your activity stays on this device.</p>
      ) : null}
      {health.error ? <p className="inline-error" role="alert">{health.error} {snapshot ? 'Your last saved summary is shown below.' : 'No new activity was saved.'}</p> : null}
      {snapshot || data.syncEnabled ? <>
        <div className="activity-date-row">
          <label className="field">
            <span>Activity date</span>
            <input type="date" value={date} min={snapshot?.startDate} max={today}
              onChange={(event) => { if (event.target.value) setDate(event.target.value); }} />
          </label>
          {date !== today ? <button className="button button--secondary" type="button" onClick={() => setDate(today)}>Today</button> : null}
        </div>
        <div className="activity-metrics">
          <Metric label="Steps" value={day?.steps} unit="steps" />
          <Metric label="Move" value={moveTime ? day?.moveMinutes : day?.activeEnergyKcal}
            unit={moveTime ? 'min' : 'kcal'} goal={day?.moveGoal} tone="move" />
          <Metric label="Exercise" value={day?.exerciseMinutes} unit="min" goal={day?.exerciseGoalMinutes} tone="exercise" />
          <Metric label="Stand hours" value={day?.standHours} unit="hrs" goal={day?.standGoalHours} tone="stand" />
          <Metric label="Standing time" value={day?.standMinutes} unit="min" />
          <Metric label="Workout time" value={snapshot ? workouts.reduce((sum, item) => sum + item.minutes, 0) : null} unit="min" />
        </div>
        <p className="supporting-copy">Stand hours count hours with at least a minute of standing and movement.
          Standing time measures total minutes. Workout time can differ from your Exercise ring.</p>
        {!hasReadings ? <p className="notice">No daily readings available for {date === today ? 'today' : formatDateShort(date)}.
          Missing readings appear as —. Check the Health permissions for CalorieTrack and whether your Watch has synced.</p> : null}
        <div className="stack stack--tight">
          <h3>{date === today ? 'Today’s' : formatDateShort(date)} workouts</h3>
          {workouts.length === 0 ? <p className="supporting-copy">No Apple Health workouts available for this day.</p> : (
            <ul className="activity-workouts">
              {workouts.map((workout) => (
                <li key={workout.id}>
                  <div><strong>{workout.name}</strong><p className="supporting-copy">
                    {new Date(workout.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · Apple Health
                  </p></div>
                  <div className="activity-workout-totals">
                    <strong>{amount(workout.minutes)} min</strong>
                    {workout.distanceMeters !== null ? <span>
                      {(workout.distanceMeters / (unitSystem === 'imperial' ? 1609.344 : 1000)).toFixed(2)} {unitSystem === 'imperial' ? 'mi' : 'km'}
                    </span> : null}
                    {workout.activeEnergyKcal !== null ? <span>{amount(workout.activeEnergyKcal)} kcal</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {snapshot ? <p className="supporting-copy" role="status">Last synced {new Date(snapshot.syncedAt).toLocaleString()}.
          {snapshot.endDate < today ? ' This summary does not include today yet.' : ''}</p> : null}
      </> : null}
      {data.syncEnabled ? <>
        <p className="supporting-copy">Sync refreshes while the iPhone app is open and when you return to it.
          Manage access in Apple Health → your profile → Apps → CalorieTrack.</p>
        <button className="button button--secondary" type="button" onClick={health.disconnect}>Disconnect & clear saved activity</button>
      </> : null}
    </section>
  );
}
