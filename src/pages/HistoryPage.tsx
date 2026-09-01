import { useMemo, useState } from 'react';
import type { CalorieEntry, UserProfile, WeightEntry } from '../types';
import { AppHeader } from '../components/AppHeader';
import { CalorieEntryRow } from '../components/CalorieEntryRow';
import { EmptyState } from '../components/EmptyState';
import { ModalShell } from '../components/ModalShell';
import { getDailyTarget } from '../utils/calories';
import { formatDate, sortDateKeysDescending } from '../utils/dates';
import { formatWeight } from '../utils/units';

interface HistoryPageProps {
  profile: UserProfile;
  calorieEntries: CalorieEntry[];
  weightEntries: WeightEntry[];
  onEditEntry: (entry: CalorieEntry) => void;
  onDeleteEntry: (entry: CalorieEntry) => void;
  onEditWeight: (entry: WeightEntry) => void;
  onDeleteWeight: (entry: WeightEntry) => void;
  onLogWeight: (date: string) => void;
}

export function HistoryPage({
  profile,
  calorieEntries,
  weightEntries,
  onEditEntry,
  onDeleteEntry,
  onEditWeight,
  onDeleteWeight,
  onLogWeight
}: HistoryPageProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const targetCalories = getDailyTarget(profile);

  const days = useMemo(() => {
    const uniqueDates = new Set<string>();
    calorieEntries.forEach((entry) => uniqueDates.add(entry.date));
    weightEntries.forEach((entry) => uniqueDates.add(entry.date));

    return sortDateKeysDescending(Array.from(uniqueDates));
  }, [calorieEntries, weightEntries]);

  const selectedEntries = selectedDate
    ? calorieEntries.filter((entry) => entry.date === selectedDate)
    : [];
  const selectedWeight = selectedDate
    ? weightEntries.find((entry) => entry.date === selectedDate) ?? null
    : null;
  const selectedCalories = selectedEntries.reduce((sum, entry) => sum + entry.calories, 0);
  const selectedDifference = targetCalories - selectedCalories;

  return (
    <div className="page">
      <AppHeader
        eyebrow="History"
        title="Previous days"
        subtitle="Newest first, including calorie totals and weigh-ins."
      />

      {days.length === 0 ? (
        <EmptyState
          title="No calorie entries yet."
          description="Your previous days will appear here as soon as you start logging."
        />
      ) : (
        <div className="history-list">
          {days.map((date) => {
            const dayEntries = calorieEntries.filter((entry) => entry.date === date);
            const dayWeight = weightEntries.find((entry) => entry.date === date) ?? null;
            const totalCalories = dayEntries.reduce((sum, entry) => sum + entry.calories, 0);
            const difference = targetCalories - totalCalories;

            return (
              <button
                key={date}
                type="button"
                className="history-row"
                onClick={() => setSelectedDate(date)}
              >
                <div>
                  <h2>{formatDate(date, { month: 'long', day: 'numeric' })}</h2>
                  <p className="supporting-copy">
                    {totalCalories.toLocaleString()} / {targetCalories.toLocaleString()} kcal
                  </p>
                </div>
                <div className="history-row__meta">
                  <span className={difference < 0 ? 'tone-warning' : 'tone-success'}>
                    {difference > 0
                      ? `${difference} remaining`
                      : difference < 0
                        ? `${Math.abs(difference)} over`
                        : 'On target'}
                  </span>
                  {dayWeight ? (
                    <span>{formatWeight(dayWeight.weightKg, profile.unitSystem)}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ModalShell
        open={selectedDate !== null}
        title={selectedDate ? formatDate(selectedDate) : 'History detail'}
        onClose={() => setSelectedDate(null)}
      >
        {selectedDate ? (
          <div className="stack">
            <div className="card card--subtle">
              <div className="stats-grid">
                <div>
                  <p className="stat-label">Total calories</p>
                  <p className="stat-value">
                    {selectedCalories.toLocaleString()} kcal
                  </p>
                </div>
                <div>
                  <p className="stat-label">Target calories</p>
                  <p className="stat-value">{targetCalories.toLocaleString()} kcal</p>
                </div>
                <div>
                  <p className="stat-label">Difference</p>
                  <p className="stat-value">
                    {selectedDifference > 0
                      ? `${selectedDifference} remaining`
                      : selectedDifference < 0
                        ? `${Math.abs(selectedDifference)} over target`
                        : 'Target reached'}
                  </p>
                </div>
                <div>
                  <p className="stat-label">Weight</p>
                  <p className="stat-value">
                    {selectedWeight
                      ? formatWeight(selectedWeight.weightKg, profile.unitSystem)
                      : 'No weigh-in'}
                  </p>
                </div>
              </div>
            </div>

            {selectedEntries.length === 0 ? (
              <EmptyState
                title="No calorie entries for this day."
                description="Weight can still be logged for this date."
              />
            ) : (
              <div className="stack stack--tight">
                {selectedEntries.map((entry) => (
                  <CalorieEntryRow
                    key={entry.id}
                    entry={entry}
                    onEdit={(nextEntry) => {
                      setSelectedDate(null);
                      onEditEntry(nextEntry);
                    }}
                    onDelete={(nextEntry) => {
                      setSelectedDate(null);
                      onDeleteEntry(nextEntry);
                    }}
                  />
                ))}
              </div>
            )}

            <div className="sheet-actions">
              {selectedWeight ? (
                <>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => {
                      setSelectedDate(null);
                      onDeleteWeight(selectedWeight);
                    }}
                  >
                    Delete Weight
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => {
                      setSelectedDate(null);
                      onEditWeight(selectedWeight);
                    }}
                  >
                    Edit Weight
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    const date = selectedDate;
                    if (!date) {
                      return;
                    }
                    setSelectedDate(null);
                    onLogWeight(date);
                  }}
                >
                  Log Weight
                </button>
              )}
            </div>
          </div>
        ) : null}
      </ModalShell>
    </div>
  );
}
