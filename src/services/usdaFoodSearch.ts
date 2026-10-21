import {
  isFoodResult,
  normalizeUsdaFoods,
  type FoodResult
} from './foodNutrition';

const ENDPOINT = import.meta.env.VITE_USDA_FOOD_SEARCH_API_URL?.trim() ?? '';
const CACHE_KEY = 'calorietrack.food-search.v2';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
type CacheEntry = { query: string; foods: FoodResult[]; savedAt: number };

export class UsdaFoodSearchError extends Error {}
export function isUsdaFoodSearchConfigured(): boolean {
  return Boolean(ENDPOINT);
}

function readCache(): CacheEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is CacheEntry =>
            entry &&
            typeof entry.query === 'string' &&
            Number.isFinite(entry.savedAt) &&
            Date.now() - entry.savedAt < CACHE_TTL &&
            Array.isArray(entry.foods) &&
            entry.foods.every(isFoodResult)
        )
      : [];
  } catch {
    return [];
  }
}

export interface FoodSearchResponse {
  foods: FoodResult[];
  cached: boolean;
}

export async function searchUsdaFoods(
  query: string,
  signal?: AbortSignal
): Promise<FoodSearchResponse> {
  const normalized = query.trim().replace(/\s+/g, ' ').toLowerCase();
  if (normalized.length < 2 || normalized.length > 120)
    throw new UsdaFoodSearchError('Enter 2–120 characters to search.');
  const cache = readCache();
  const cached = cache.find((entry) => entry.query === normalized);
  if (cached) return { foods: cached.foods, cached: true };
  if (!navigator.onLine)
    throw new UsdaFoodSearchError(
      'You’re offline. Previously searched foods are available; new searches need internet.'
    );

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15000);
  try {
    // DEMO_KEY is USDA’s intentionally public, limited-access key, never a private secret.
    const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
    url.search = new URLSearchParams({
      api_key: 'DEMO_KEY',
      query: normalized,
      pageSize: '24'
    }).toString();
    const response = await fetch(
      ENDPOINT || url.toString(),
      ENDPOINT
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: normalized }),
            signal: controller.signal
          }
        : { signal: controller.signal }
    );
    if (response.status === 429)
      throw new UsdaFoodSearchError(
        'The food database’s search limit has been reached. Try again later or use a previously searched food.'
      );
    if (!response.ok)
      throw new UsdaFoodSearchError(
        'The food database is unavailable right now. Try again or add calories manually.'
      );
    const payload = await response.json();
    let foods: FoodResult[];
    if (ENDPOINT) {
      if (!Array.isArray(payload?.foods))
        throw new UsdaFoodSearchError(
          'Food search returned an unexpected response.'
        );
      // Older Workers return energy per 100 g, despite their serving labels.
      foods = payload.foods.map((food: Record<string, unknown> | null) =>
        food && isFoodResult(food)
          ? food
          : {
              id: food?.id,
              description: food?.description,
              brand: food?.brand ?? null,
              caloriesPer100: food?.calories,
              unit: 'g',
              servingAmount: null,
              servingDescription: null
            }
      );
      if (!foods.every(isFoodResult))
        throw new UsdaFoodSearchError(
          'Food search returned an unexpected response.'
        );
    } else foods = normalizeUsdaFoods(payload);
    foods.sort((a, b) => Number(Boolean(a.brand)) - Number(Boolean(b.brand)));
    if (foods.length) {
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify(
            [
              { query: normalized, foods, savedAt: Date.now() },
              ...cache.filter((entry) => entry.query !== normalized)
            ].slice(0, 30)
          )
        );
      } catch {
        /* Search still works if browser storage is full. */
      }
    }
    return { foods, cached: false };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (controller.signal.aborted)
      throw new UsdaFoodSearchError(
        'Food search took too long. Please try again.'
      );
    if (error instanceof UsdaFoodSearchError) throw error;
    throw new UsdaFoodSearchError(
      'Couldn’t reach the food database. Check your connection and try again.'
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
