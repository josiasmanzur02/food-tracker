export interface FoodResult {
  id: string;
  description: string;
  brand: string | null;
  caloriesPer100: number;
  unit: 'g' | 'ml';
  servingAmount: number | null;
  servingDescription: string | null;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeUsdaFoods(payload: unknown): FoodResult[] {
  const foods = record(payload).foods;
  if (!Array.isArray(foods))
    throw new Error('Food search returned an unexpected response.');
  const results = foods
    .map((value): FoodResult | null => {
      const food = record(value);
      if (!food.fdcId || typeof food.description !== 'string') return null;
      const nutrients = Array.isArray(food.foodNutrients)
        ? food.foodNutrients.map(record)
        : [];
      // Prefer Atwater-specific energy. Never mistake kJ for kcal.
      const energy = [2048, 1008, 2047]
        .map((id) =>
          nutrients.find(
            (n) =>
              n.nutrientId === id && String(n.unitName).toLowerCase() === 'kcal'
          )
        )
        .find(
          (n) =>
            typeof n?.value === 'number' &&
            Number.isFinite(n.value) &&
            n.value >= 0
        );
      if (!energy || typeof energy.value !== 'number') return null;
      const rawUnit = String(food.servingSizeUnit ?? '').toLowerCase();
      const unit = rawUnit === 'ml' ? 'ml' : 'g';
      // Household measures (cups, oz, pieces) cannot be treated as grams.
      const servingAmount =
        (rawUnit === 'g' || rawUnit === 'ml') &&
        typeof food.servingSize === 'number' &&
        Number.isFinite(food.servingSize) &&
        food.servingSize > 0
          ? food.servingSize
          : null;
      return {
        id: String(food.fdcId),
        description: food.description,
        brand:
          typeof food.brandOwner === 'string'
            ? food.brandOwner
            : typeof food.brandName === 'string'
              ? food.brandName
              : null,
        caloriesPer100: energy.value,
        unit,
        servingAmount,
        servingDescription: servingAmount ? `${servingAmount} ${unit}` : null
      };
    })
    .filter((food): food is FoodResult => food !== null);
  return [...new Map(results.map((food) => [food.id, food])).values()];
}

export function isFoodResult(value: unknown): value is FoodResult {
  const food = record(value);
  return (
    typeof food.id === 'string' &&
    typeof food.description === 'string' &&
    (food.brand === null || typeof food.brand === 'string') &&
    typeof food.caloriesPer100 === 'number' &&
    Number.isFinite(food.caloriesPer100) &&
    food.caloriesPer100 >= 0 &&
    (food.unit === 'g' || food.unit === 'ml') &&
    (food.servingAmount === null ||
      (typeof food.servingAmount === 'number' &&
        Number.isFinite(food.servingAmount) &&
        food.servingAmount > 0)) &&
    (food.servingDescription === null ||
      typeof food.servingDescription === 'string')
  );
}

export function portionCalories(food: FoodResult, amount: number): number {
  return Math.round((food.caloriesPer100 * amount) / 100);
}
