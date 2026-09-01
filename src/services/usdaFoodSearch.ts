export interface UsdaFoodResult {
  id: string;
  description: string;
  brand: string | null;
  calories: number;
  servingDescription: string | null;
}

const USDA_FOOD_SEARCH_ENDPOINT = import.meta.env.VITE_USDA_FOOD_SEARCH_API_URL?.trim() ?? '';

export class UsdaFoodSearchError extends Error {}

export function isUsdaFoodSearchConfigured(): boolean {
  return Boolean(USDA_FOOD_SEARCH_ENDPOINT);
}

export async function searchUsdaFoods(query: string): Promise<UsdaFoodResult[]> {
  if (!navigator.onLine) {
    throw new UsdaFoodSearchError('Food search requires an internet connection.');
  }

  if (!isUsdaFoodSearchConfigured()) {
    throw new UsdaFoodSearchError('Food search is not configured yet. Add the secure USDA search endpoint first.');
  }

  const response = await fetch(USDA_FOOD_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });

  if (response.status === 429) {
    throw new UsdaFoodSearchError('Food search is temporarily rate limited. Please try again shortly.');
  }

  if (!response.ok) {
    throw new UsdaFoodSearchError('Food search is unavailable right now. Please add calories manually.');
  }

  const payload: unknown = await response.json();

  if (!isFoodSearchPayload(payload)) {
    throw new UsdaFoodSearchError('Food search returned an unexpected response.');
  }

  return payload.foods;
}

function isFoodSearchPayload(value: unknown): value is { foods: UsdaFoodResult[] } {
  if (typeof value !== 'object' || value === null || !('foods' in value) || !Array.isArray(value.foods)) {
    return false;
  }

  return value.foods.every(
    (food) =>
      typeof food === 'object' &&
      food !== null &&
      typeof food.id === 'string' &&
      typeof food.description === 'string' &&
      (typeof food.brand === 'string' || food.brand === null) &&
      typeof food.calories === 'number' &&
      Number.isFinite(food.calories) &&
      (typeof food.servingDescription === 'string' || food.servingDescription === null)
  );
}
