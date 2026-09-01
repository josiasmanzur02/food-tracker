import { useState } from 'react';
import type { MealType } from '../types';
import {
  isUsdaFoodSearchConfigured,
  searchUsdaFoods,
  type UsdaFoodResult
} from '../services/usdaFoodSearch';
import { ModalShell } from './ModalShell';

interface FoodSearchSheetProps {
  open: boolean;
  onClose: () => void;
  onAddFood: (input: { calories: number; description: string; meal?: MealType }) => void;
}

const MEAL_OPTIONS: Array<{ value: MealType; label: string }> = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'other', label: 'Other' }
];

export function FoodSearchSheet({ open, onClose, onAddFood }: FoodSearchSheetProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UsdaFoodResult[]>([]);
  const [selectedFood, setSelectedFood] = useState<UsdaFoodResult | null>(null);
  const [selectedCalories, setSelectedCalories] = useState('');
  const [meal, setMeal] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 2) {
      setError('Enter at least two characters to search.');
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const foods = await searchUsdaFoods(normalizedQuery);
      setResults(foods);
      setSelectedFood(null);
      if (foods.length === 0) setError('No matching foods found. Try a simpler search.');
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Food search failed.');
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <ModalShell open={open} title="Search USDA Foods" onClose={onClose}>
      <div className="food-search">
        <p className="sheet-form__hint">Search USDA FoodData Central, then review the calorie amount before adding it.</p>
        <form className="food-search__form" onSubmit={handleSearch}>
          <label className="field">
            <span>Food</span>
            <input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chicken breast, oatmeal, banana" />
          </label>
          <label className="field">
            <span>Meal</span>
            <select value={meal} onChange={(event) => setMeal(event.target.value)}>
              <option value="">None</option>
              {MEAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button type="submit" className="button button--primary" disabled={isSearching}>{isSearching ? 'Searching...' : 'Search foods'}</button>
        </form>
        {!isUsdaFoodSearchConfigured() ? <p className="form-message">USDA search needs a secure endpoint before it can be used. Manual calorie logging remains available.</p> : null}
        {error ? <p className="form-message form-message--error">{error}</p> : null}
        {results.length > 0 ? (
          <div className="food-search__results" aria-live="polite">
            {results.map((food) => (
              <article key={food.id} className="food-search__result">
                <div><h3>{food.description}</h3><p>{[food.brand, food.servingDescription].filter(Boolean).join(' · ') || 'USDA food result'}</p></div>
                <div className="food-search__action"><strong>{food.calories} cal</strong><button type="button" className="button button--secondary" onClick={() => { setSelectedFood(food); setSelectedCalories(String(food.calories)); }}>Use</button></div>
              </article>
            ))}
          </div>
        ) : null}
        {selectedFood ? (
          <form className="food-search__confirm" onSubmit={(event) => {
            event.preventDefault();
            const calories = Number(selectedCalories);
            if (!Number.isFinite(calories) || calories <= 0) {
              setError('Enter a calorie amount greater than zero.');
              return;
            }
            onAddFood({ calories, description: selectedFood.brand ? `${selectedFood.description} (${selectedFood.brand})` : selectedFood.description, meal: meal ? (meal as MealType) : undefined });
          }}>
            <p><strong>Review {selectedFood.description}</strong></p>
            <label className="field"><span>Calories to add</span><input inputMode="numeric" type="number" min="1" step="1" value={selectedCalories} onChange={(event) => setSelectedCalories(event.target.value)} required /></label>
            <p className="sheet-form__hint">Adjust this if your portion differs from the USDA result.</p>
            <button type="submit" className="button button--primary">Add to today</button>
          </form>
        ) : null}
      </div>
    </ModalShell>
  );
}
