interface CalorieProgressProps {
  consumedCalories: number;
  targetCalories: number;
}

export function CalorieProgress({
  consumedCalories,
  targetCalories
}: CalorieProgressProps) {
  const progress = targetCalories > 0 ? Math.min(consumedCalories / targetCalories, 1) : 0;
  const difference = targetCalories - consumedCalories;
  const statusLabel =
    difference > 0
      ? `${difference} remaining`
      : difference < 0
        ? `${Math.abs(difference)} over target`
        : 'Target reached';

  return (
    <section className="hero-card">
      <p className="hero-card__label">Today</p>
      <div className="hero-card__numbers">
        <div>
          <p className="hero-card__value">{consumedCalories.toLocaleString()}</p>
          <p className="hero-card__caption">calories eaten</p>
        </div>
        <div className={`hero-card__status ${difference < 0 ? 'tone-warning' : 'tone-success'}`}>
          {statusLabel}
        </div>
      </div>
      <p className="hero-card__ratio">
        {consumedCalories.toLocaleString()} / {targetCalories.toLocaleString()} kcal
      </p>
      <div className="progress-track" aria-hidden="true">
        <div className="progress-track__fill" style={{ width: `${progress * 100}%` }} />
      </div>
    </section>
  );
}
