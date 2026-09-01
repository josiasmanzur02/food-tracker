import type { CalorieEntry, UserProfile, WeightEntry } from '../types';
import { AppHeader } from '../components/AppHeader';
import { EmptyState } from '../components/EmptyState';
import { WeightChart } from '../components/WeightChart';
import { calculateAverageDailyCalories } from '../utils/calories';
import { formatMonthYear } from '../utils/dates';
import { calculateAverageWeeklyChange, estimateGoalProjection } from '../utils/trends';
import { formatSignedWeightDelta, formatWeight } from '../utils/units';
import { calculateWeightProgress } from '../utils/weight';

interface ProgressPageProps {
  profile: UserProfile;
  calorieEntries: CalorieEntry[];
  weightEntries: WeightEntry[];
}

export function ProgressPage({
  profile,
  calorieEntries,
  weightEntries
}: ProgressPageProps) {
  const progress = calculateWeightProgress(profile, weightEntries);
  const averageWeeklyChange = calculateAverageWeeklyChange(weightEntries);
  const goalProjection = estimateGoalProjection(profile, weightEntries);
  const averageDailyCalories = calculateAverageDailyCalories(calorieEntries);
  const daysLogged = new Set([
    ...calorieEntries.map((entry) => entry.date),
    ...weightEntries.map((entry) => entry.date)
  ]).size;
  const progressPercent = Math.round(Math.min(progress.progressPercent, 1) * 100);

  const totalChangeLabel =
    profile.goalType === 'gain'
      ? `${formatWeight(Math.abs(progress.totalChangeKg), profile.unitSystem)} gained`
      : profile.goalType === 'maintain'
        ? 'Maintaining'
        : `${formatWeight(Math.abs(progress.totalChangeKg), profile.unitSystem)} lost`;

  return (
    <div className="page">
      <AppHeader
        eyebrow="Progress"
        title={formatWeight(progress.currentWeightKg, profile.unitSystem)}
        subtitle={totalChangeLabel}
      />

      <section className="card">
        <div className="stats-grid">
          <div>
            <p className="stat-label">Starting</p>
            <p className="stat-value">{formatWeight(profile.startingWeightKg, profile.unitSystem)}</p>
          </div>
          <div>
            <p className="stat-label">Current</p>
            <p className="stat-value">{formatWeight(progress.currentWeightKg, profile.unitSystem)}</p>
          </div>
          <div>
            <p className="stat-label">Goal</p>
            <p className="stat-value">{formatWeight(profile.goalWeightKg, profile.unitSystem)}</p>
          </div>
          <div>
            <p className="stat-label">Goal progress</p>
            <p className="stat-value">{progressPercent}%</p>
          </div>
        </div>
      </section>

      {weightEntries.length > 0 ? (
        <WeightChart
          entries={weightEntries}
          goalWeightKg={profile.goalWeightKg}
          unitSystem={profile.unitSystem}
        />
      ) : (
        <EmptyState
          title="No weight history yet."
          description="Log your weight to start seeing progress."
        />
      )}

      <section className="card">
        <div className="card__header">
          <div>
            <p className="section-label">Stats</p>
            <h2>Progress details</h2>
          </div>
        </div>
        <div className="stats-grid">
          <div>
            <p className="stat-label">Remaining</p>
            <p className="stat-value">
              {profile.goalType === 'maintain'
                ? '0'
                : formatWeight(Math.max(progress.remainingKg, 0), profile.unitSystem)}
            </p>
          </div>
          <div>
            <p className="stat-label">Average weekly change</p>
            <p className="stat-value">
              {averageWeeklyChange === null
                ? '—'
                : `${formatSignedWeightDelta(averageWeeklyChange, profile.unitSystem)}/week`}
            </p>
          </div>
          <div>
            <p className="stat-label">Average daily calories</p>
            <p className="stat-value">
              {averageDailyCalories === null ? '—' : `${averageDailyCalories.toLocaleString()} kcal`}
            </p>
          </div>
          <div>
            <p className="stat-label">Days logged</p>
            <p className="stat-value">{daysLogged}</p>
          </div>
        </div>
        <div className="card card--subtle">
          <p className="stat-label">Goal date</p>
          <p className="stat-value">
            {goalProjection.status === 'estimable' && goalProjection.estimatedDate
              ? formatMonthYear(goalProjection.estimatedDate)
              : goalProjection.status === 'goalReached'
                ? 'Goal reached'
                : 'More weight entries are needed to estimate your goal date.'}
          </p>
        </div>
      </section>
    </div>
  );
}
