import type { CalorieEntry, UserProfile } from '../types';
import { AppHeader } from '../components/AppHeader';
import { CalorieEntryRow } from '../components/CalorieEntryRow';
import { CalorieProgress } from '../components/CalorieProgress';
import { EmptyState } from '../components/EmptyState';
import { WeightSummary } from '../components/WeightSummary';
import { formatDate } from '../utils/dates';

interface TodayPageProps {
  profile: UserProfile;
  todayDate: string;
  targetCalories: number;
  currentWeightKg: number;
  calorieEntries: CalorieEntry[];
  isOnline: boolean;
  onAddCalories: () => void;
  onOpenMealScanner: () => void;
  onEditEntry: (entry: CalorieEntry) => void;
  onDeleteEntry: (entry: CalorieEntry) => void;
  onLogWeight: () => void;
}

const MEAL_ORDER: Array<NonNullable<CalorieEntry['meal']>> = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'other'
];

const MEAL_LABELS: Record<NonNullable<CalorieEntry['meal']>, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  other: 'Other'
};

export function TodayPage({
  profile,
  todayDate,
  targetCalories,
  currentWeightKg,
  calorieEntries,
  isOnline,
  onAddCalories,
  onOpenMealScanner,
  onEditEntry,
  onDeleteEntry,
  onLogWeight
}: TodayPageProps) {
  const consumedCalories = calorieEntries.reduce((sum, entry) => sum + entry.calories, 0);
  const groupedEntries = MEAL_ORDER.map((meal) => ({
    meal,
    entries: calorieEntries.filter((entry) => (entry.meal ?? 'other') === meal)
  })).filter((group) => group.entries.length > 0);

  return (
    <div className="page">
      <AppHeader eyebrow={formatDate(todayDate)} title="Today" />
      <CalorieProgress consumedCalories={consumedCalories} targetCalories={targetCalories} />

      <section className="quick-actions">
        <button type="button" className="button button--primary button--large" onClick={onAddCalories}>
          + Add Calories
        </button>
        <button
          type="button"
          className="button button--secondary button--large"
          onClick={onOpenMealScanner}
        >
          Search Food
        </button>
      </section>

      {!isOnline ? (
        <p className="supporting-copy">
          Meal scanning requires an internet connection. Manual calorie logging still works offline.
        </p>
      ) : null}

      <section className="card">
        <div className="card__header">
          <div>
            <p className="section-label">Today&apos;s food</p>
            <h2>Entries</h2>
          </div>
        </div>
        {groupedEntries.length === 0 ? (
          <EmptyState
            title="No calorie entries yet."
            description="Add your first meal to start tracking today's calories."
            action={
              <button type="button" className="button button--secondary" onClick={onAddCalories}>
                Add Calories
              </button>
            }
          />
        ) : (
          <div className="stack">
            {groupedEntries.map((group) => (
              <section key={group.meal} className="meal-group">
                <h3 className="meal-group__title">{MEAL_LABELS[group.meal]}</h3>
                <div className="stack stack--tight">
                  {group.entries.map((entry) => (
                    <CalorieEntryRow
                      key={entry.id}
                      entry={entry}
                      onEdit={onEditEntry}
                      onDelete={onDeleteEntry}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      <WeightSummary
        currentWeightKg={currentWeightKg}
        goalWeightKg={profile.goalWeightKg}
        startingWeightKg={profile.startingWeightKg}
        goalType={profile.goalType}
        unitSystem={profile.unitSystem}
        onLogWeight={onLogWeight}
      />

      {profile.targetNotice ? (
        <div className="notice-card notice-card--warning">
          <p>{profile.targetNotice}</p>
        </div>
      ) : null}
    </div>
  );
}
