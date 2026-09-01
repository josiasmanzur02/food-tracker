const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

function corsHeaders(origin, allowedOrigin) {
  return { 'Access-Control-Allow-Origin': allowedOrigin === '*' ? '*' : origin === allowedOrigin ? origin : allowedOrigin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=UTF-8' } });
}

function getCalories(food) {
  const nutrient = food.foodNutrients?.find((item) => item.nutrientNumber === '208' || item.nutrientName === 'Energy');
  return Number.isFinite(nutrient?.value) ? Math.round(nutrient.value) : null;
}

export default { async fetch(request, env) {
  const headers = corsHeaders(request.headers.get('Origin') ?? '', env.ALLOWED_ORIGIN ?? '*');
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);
  if (!env.USDA_API_KEY) return json({ error: 'USDA_API_KEY is not configured' }, 500, headers);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400, headers); }
  const query = typeof payload.query === 'string' ? payload.query.trim() : '';
  if (query.length < 2 || query.length > 120) return json({ error: 'Query must be 2 to 120 characters' }, 400, headers);
  const response = await fetch(`${USDA_SEARCH_URL}?api_key=${encodeURIComponent(env.USDA_API_KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, pageSize: 12 }) });
  if (!response.ok) return json({ error: 'USDA search failed' }, response.status, headers);
  const data = await response.json();
  const foods = (data.foods ?? []).map((food) => {
    const calories = getCalories(food);
    if (calories === null || !food.fdcId || !food.description) return null;
    return { id: String(food.fdcId), description: food.description, brand: food.brandOwner ?? food.brandName ?? null, calories, servingDescription: food.servingSize ? `${food.servingSize} ${food.servingSizeUnit ?? 'g'}` : null };
  }).filter(Boolean);
  return json({ foods }, 200, headers);
} };
