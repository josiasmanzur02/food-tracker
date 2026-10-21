import { normalizeUsdaFoods } from '../../src/services/foodNutrition.ts';

const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=UTF-8' }
  });
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGIN ?? '*';
    const headers = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin'
    };
    if (origin && allowed !== '*' && origin !== allowed)
      return json({ error: 'Origin not allowed' }, 403, headers);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'POST')
      return json({ error: 'Method not allowed' }, 405, headers);
    if (!env.USDA_API_KEY)
      return json({ error: 'USDA_API_KEY is not configured' }, 503, headers);
    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, headers);
    }
    const query =
      typeof payload?.query === 'string' ? payload.query.trim() : '';
    if (query.length < 2 || query.length > 120)
      return json({ error: 'Query must be 2 to 120 characters' }, 400, headers);
    try {
      const response = await fetch(
        `${USDA_SEARCH_URL}?api_key=${encodeURIComponent(env.USDA_API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, pageSize: 24 }),
          signal: AbortSignal.timeout(12000)
        }
      );
      if (!response.ok)
        return json(
          { error: 'USDA search failed' },
          response.status === 429 ? 429 : 502,
          headers
        );
      return json(
        { foods: normalizeUsdaFoods(await response.json()) },
        200,
        headers
      );
    } catch {
      return json(
        { error: 'USDA search is temporarily unavailable' },
        502,
        headers
      );
    }
  }
};
