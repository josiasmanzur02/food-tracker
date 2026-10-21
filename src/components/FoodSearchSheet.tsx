import { useEffect, useRef, useState } from 'react';
import type { MealType } from '../types';
import {
  isUsdaFoodSearchConfigured,
  searchUsdaFoods
} from '../services/usdaFoodSearch';
import { portionCalories, type FoodResult } from '../services/foodNutrition';
import { ModalShell } from './ModalShell';

interface FoodSearchSheetProps {
  open: boolean;
  onClose: () => void;
  onAddFood: (input: {
    calories: number;
    description: string;
    meal?: MealType;
  }) => void;
}

export function FoodSearchSheet({
  open,
  onClose,
  onAddFood
}: FoodSearchSheetProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodResult[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null);
  const [amount, setAmount] = useState('100');
  const [meal, setMeal] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setSelectedFood(null);
      setError('');
      setIsSearching(false);
    }
    return () => {
      requestRef.current?.abort();
    };
  }, [open]);
  useEffect(() => {
    if (selectedFood) reviewRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedFood]);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsSearching(true);
    setError('');
    setMessage('');
    setResults([]);
    setSelectedFood(null);
    try {
      const result = await searchUsdaFoods(query, controller.signal);
      if (controller.signal.aborted) return;
      setResults(result.foods);
      setMessage(
        result.foods.length
          ? `${result.foods.length} foods${result.cached ? ' · saved search' : ''}. Choose the preparation and brand that match your food.`
          : 'No foods with calorie data found. Try a simpler name, such as “rice cooked”.'
      );
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : 'Food search failed.');
    } finally {
      if (!controller.signal.aborted) setIsSearching(false);
    }
  }

  const calories = selectedFood
    ? portionCalories(selectedFood, Number(amount))
    : 0;
  return (
    <ModalShell open={open} title="Search food" onClose={onClose}>
      <div className="food-search">
        <p className="sheet-form__hint">
          Find a food, enter your portion, and review the calorie estimate.
        </p>
        <form className="food-search__form" onSubmit={handleSearch}>
          <label className="field">
            <span>Food or brand</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Banana, chicken breast, cooked rice"
              minLength={2}
              maxLength={120}
              required
            />
          </label>
          <button
            type="submit"
            className="button button--primary"
            disabled={isSearching}
          >
            {isSearching ? 'Searching USDA…' : 'Search foods'}
          </button>
        </form>
        {error && (
          <p className="form-message form-message--error" role="alert">
            {error}
          </p>
        )}
        <p className="sheet-form__hint" role="status">
          {message}
        </p>
        <div ref={reviewRef}>
          {selectedFood && (
            <form
              className="food-search__confirm card card--subtle"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  !Number.isFinite(Number(amount)) ||
                  Number(amount) <= 0 ||
                  Number(amount) > 10000 ||
                  !Number.isFinite(calories)
                ) {
                  setError('Enter a portion between 0.1 and 10,000.');
                  return;
                }
                onAddFood({
                  calories,
                  description: `${selectedFood.description}${selectedFood.brand ? ` (${selectedFood.brand})` : ''} · ${amount} ${selectedFood.unit} · USDA estimate`,
                  meal: meal ? (meal as MealType) : undefined
                });
              }}
            >
              <div className="card__header">
                <h3>{selectedFood.description}</h3>
                <button
                  type="button"
                  className="button button--inline"
                  onClick={() => setSelectedFood(null)}
                >
                  Cancel
                </button>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Portion ({selectedFood.unit})</span>
                  <input
                    inputMode="decimal"
                    type="number"
                    min="0.1"
                    max="10000"
                    step="0.1"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Meal</span>
                  <select
                    value={meal}
                    onChange={(event) => setMeal(event.target.value)}
                  >
                    <option value="">Other</option>
                    {['breakfast', 'lunch', 'dinner', 'snack'].map((value) => (
                      <option key={value} value={value}>
                        {value[0].toUpperCase() + value.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {selectedFood.servingAmount && (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setAmount(String(selectedFood.servingAmount))}
                >
                  Use label serving · {selectedFood.servingDescription}
                </button>
              )}
              <p className="food-estimate">
                <strong>
                  {Number.isFinite(calories) && Number(amount) > 0
                    ? calories
                    : '—'}
                </strong>{' '}
                kcal estimated
              </p>
              <p className="sheet-form__hint">
                {Math.round(selectedFood.caloriesPer100)} kcal per 100{' '}
                {selectedFood.unit}. Preparation, oils and sauces can change the
                total.
              </p>
              <button type="submit" className="button button--primary">
                Add to today
              </button>
            </form>
          )}
        </div>
        <div className="food-search__results" aria-busy={isSearching}>
          {results.map((food) => (
            <article key={food.id} className="food-search__result">
              <div>
                <h3>{food.description}</h3>
                <p>
                  {food.brand || 'Generic food'} · per 100 {food.unit}
                </p>
                <a
                  className="food-source"
                  href={`https://fdc.nal.usda.gov/food-details/${encodeURIComponent(food.id)}/nutrients`}
                  target="_blank"
                  rel="noreferrer"
                >
                  USDA details
                </a>
              </div>
              <div className="food-search__action">
                <strong>{Math.round(food.caloriesPer100)} kcal</strong>
                <button
                  type="button"
                  className="button button--secondary"
                  aria-label={`Choose ${food.description}`}
                  onClick={() => {
                    setSelectedFood(food);
                    setAmount(String(food.servingAmount ?? 100));
                    setError('');
                  }}
                >
                  Choose
                </button>
              </div>
            </article>
          ))}
        </div>
        <p className="sheet-form__hint">
          Data:{' '}
          <a href="https://fdc.nal.usda.gov/" target="_blank" rel="noreferrer">
            USDA FoodData Central
          </a>
          .{' '}
          {isUsdaFoodSearchConfigured()
            ? 'Recent searches are saved on this device.'
            : 'Public access has a small search allowance. Recent searches are saved to reduce requests and work offline.'}
        </p>
      </div>
    </ModalShell>
  );
}
