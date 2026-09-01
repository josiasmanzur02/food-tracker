import { useEffect, useState } from 'react';
import type { CalorieEntry, MealType } from '../types';
import { formatDate } from '../utils/dates';
import { ModalShell } from './ModalShell';

interface AddCaloriesSheetProps {
  open: boolean;
  date: string;
  entry?: CalorieEntry | null;
  onClose: () => void;
  onSave: (input: {
    date: string;
    calories: number;
    description?: string;
    meal?: MealType;
  }) => void;
}

const MEAL_OPTIONS: Array<{ value: MealType; label: string }> = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'other', label: 'Other' }
];

export function AddCaloriesSheet({
  open,
  date,
  entry,
  onClose,
  onSave
}: AddCaloriesSheetProps) {
  const [calories, setCalories] = useState('');
  const [description, setDescription] = useState('');
  const [meal, setMeal] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setCalories(entry ? String(entry.calories) : '');
    setDescription(entry?.description ?? '');
    setMeal(entry?.meal ?? '');
    setError(null);
  }, [entry, open]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedCalories = Number(calories);

    if (!Number.isFinite(parsedCalories) || parsedCalories <= 0 || parsedCalories > 20000) {
      setError('Enter a realistic calorie amount greater than zero.');
      return;
    }

    onSave({
      date,
      calories: parsedCalories,
      description,
      meal: meal ? (meal as MealType) : undefined
    });
  }

  return (
    <ModalShell
      open={open}
      title={entry ? 'Edit Calorie Entry' : 'Add Calories'}
      onClose={onClose}
    >
      <form className="sheet-form" onSubmit={handleSubmit}>
        <p className="sheet-form__hint">{formatDate(date)}</p>
        <label className="field">
          <span>Calories</span>
          <input
            autoFocus
            inputMode="numeric"
            type="number"
            min="1"
            step="1"
            value={calories}
            onChange={(event) => setCalories(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Description</span>
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Chicken and rice"
          />
        </label>
        <label className="field">
          <span>Meal</span>
          <select value={meal} onChange={(event) => setMeal(event.target.value)}>
            <option value="">None</option>
            {MEAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="form-message form-message--error">{error}</p> : null}
        <div className="sheet-actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary">
            {entry ? 'Save Changes' : 'Save Entry'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
