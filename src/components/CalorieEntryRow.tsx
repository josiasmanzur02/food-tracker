import type { CalorieEntry } from '../types';

interface CalorieEntryRowProps {
  entry: CalorieEntry;
  onEdit: (entry: CalorieEntry) => void;
  onDelete: (entry: CalorieEntry) => void;
}

const MEAL_LABELS: Record<NonNullable<CalorieEntry['meal']>, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  other: 'Other'
};

export function CalorieEntryRow({
  entry,
  onEdit,
  onDelete
}: CalorieEntryRowProps) {
  return (
    <article className="entry-row">
      <div className="entry-row__content">
        <div className="entry-row__topline">
          {entry.meal ? <span className="pill">{MEAL_LABELS[entry.meal]}</span> : null}
          {entry.source === 'ai' ? <span className="pill pill--muted">AI estimate</span> : null}
        </div>
        <h3>{entry.description?.trim() || 'Calorie entry'}</h3>
        <p className="entry-row__calories">{entry.calories.toLocaleString()} kcal</p>
      </div>
      <div className="entry-row__actions">
        <button type="button" className="button button--inline" onClick={() => onEdit(entry)}>
          Edit
        </button>
        <button type="button" className="button button--inline" onClick={() => onDelete(entry)}>
          Delete
        </button>
      </div>
    </article>
  );
}
