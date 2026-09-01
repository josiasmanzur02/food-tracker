import type { GoalType, UnitSystem } from '../types';
import { formatWeight } from '../utils/units';

interface WeightSummaryProps {
  currentWeightKg: number;
  goalWeightKg: number;
  startingWeightKg: number;
  goalType: GoalType;
  unitSystem: UnitSystem;
  onLogWeight: () => void;
}

export function WeightSummary({
  currentWeightKg,
  goalWeightKg,
  startingWeightKg,
  goalType,
  unitSystem,
  onLogWeight
}: WeightSummaryProps) {
  const delta =
    goalType === 'gain'
      ? currentWeightKg - startingWeightKg
      : startingWeightKg - currentWeightKg;
  const progressLabel =
    goalType === 'maintain'
      ? 'Tracking maintenance'
      : delta > 0
        ? `${formatWeight(delta, unitSystem)} ${goalType === 'gain' ? 'gained' : 'lost'}`
        : 'No change yet';

  return (
    <section className="card compact-card">
      <div className="card__header">
        <div>
          <p className="section-label">Weight</p>
          <h2>Current progress</h2>
        </div>
        <button type="button" className="button button--secondary" onClick={onLogWeight}>
          Log Weight
        </button>
      </div>
      <div className="mini-grid">
        <div>
          <p className="stat-label">Current</p>
          <p className="stat-value">{formatWeight(currentWeightKg, unitSystem)}</p>
        </div>
        <div>
          <p className="stat-label">Goal</p>
          <p className="stat-value">{formatWeight(goalWeightKg, unitSystem)}</p>
        </div>
      </div>
      <p className="supporting-copy">{progressLabel}</p>
    </section>
  );
}
