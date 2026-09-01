# CalorieTrack

CalorieTrack is a mobile-first Progressive Web App for simple daily calorie and weight tracking. It is designed to work offline, store data locally on the device, and deploy cleanly to GitHub Pages without a backend for normal tracking.

## Features

- First-run onboarding that estimates maintenance calories and a daily target using the Mifflin-St Jeor equation.
- Today dashboard with calorie remaining, quick manual entry, AI meal scanning, and weight summary.
- Weight logging with same-day updates, progress calculations, trend chart, and estimated goal-date logic when enough data exists.
- History view for previous days with calorie totals, weigh-ins, and editing support.
- Settings for profile, goal target, custom calorie target, theme, backup import/export, and reset.
- Real PWA metadata, installable manifest, service worker caching, safe-area-aware navigation, and offline shell support.
- AI meal scanner abstraction with local mock mode when no backend endpoint is configured.

## Tech stack

- React
- TypeScript
- Vite
- Plain CSS
- localStorage for persistence
- GitHub Actions for deployment
- GitHub Pages for hosting

## Local development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Run the TypeScript check only:

```bash
npm run typecheck
```

## GitHub Pages deployment

The repository includes [`.github/workflows/deploy.yml`](/Users/josias/Documents/Projects/calorie-tracker/.github/workflows/deploy.yml) for GitHub Pages deployment. The workflow:

1. Checks out `main`
2. Installs dependencies
3. Generates the PWA icons
4. Runs `npm run build`
5. Uploads `dist/`
6. Deploys the artifact to GitHub Pages

### Base URL behavior

GitHub Pages projects are not always hosted from `/`. This project handles that in [vite.config.ts](/Users/josias/Documents/Projects/calorie-tracker/vite.config.ts):

- In local development, Vite uses `/`
- In GitHub Actions, the repository name from `GITHUB_REPOSITORY` becomes the Vite `base`
- You can also override the base manually with `VITE_BASE_PATH`

That means the same build logic works for repositories named `calorie-track` or any other repository name.

## PWA installation

After the app is deployed and loaded once, supported browsers can install it:

- iPhone/iPad Safari: Share menu -> Add to Home Screen
- Android Chrome: browser install prompt or browser menu -> Install app
- Desktop Chrome/Edge: install button in the address bar

The app uses a manifest, generated icons, theme metadata, and a service worker so the shell can reopen offline after the first successful load.

## Local data and privacy

- Calorie entries, weight entries, profile data, and settings are stored in local browser storage on the current device.
- No account, cloud sync, database, Supabase, Firebase, or backend is required for normal tracking.
- Export creates a JSON backup download such as `calorietrack-backup-YYYY-MM-DD.json`.
- Import validates the backup structure before replacing local data.
- Reset clears all local app data from the current device.

## AI meal scanner architecture

The meal scanner is intentionally split between the static frontend and a secure backend:

```text
CalorieTrack PWA
-> secure backend endpoint
-> AI vision provider
-> structured JSON response
-> user review in the PWA
```

The frontend never auto-saves AI results. The user reviews and confirms the estimate before it becomes a calorie entry.

### Mock mode

If `VITE_MEAL_SCANNER_API_URL` is empty, the app stays fully testable by returning a built-in mock meal analysis result from [src/services/mealScanner.ts](/Users/josias/Documents/Projects/calorie-tracker/src/services/mealScanner.ts).

### Environment variable

Create a local `.env` file if you want to connect a real backend:

```bash
VITE_MEAL_SCANNER_API_URL=https://your-backend.example.com/analyze-meal
```

An example file is included at [.env.example](/Users/josias/Documents/Projects/calorie-tracker/.env.example).

## Security note

Do not put an OpenAI key or any other AI provider secret in the Vite frontend, committed `.env` files, or GitHub Pages output. Anything bundled into the frontend can be inspected and stolen. Backend secrets belong only on the backend platform.

## Free USDA Food Search

The `Search Food` action searches USDA FoodData Central. USDA provides food and nutrition lookup, not meal-photo recognition. A small Cloudflare Worker is included so the free USDA key stays off GitHub Pages.

1. Create a free key from the [USDA API guide](https://fdc.nal.usda.gov/api-guide/).
2. From `worker/`, run `npx wrangler login`, then `npx wrangler secret put USDA_API_KEY`.
3. Run `npx wrangler secret put ALLOWED_ORIGIN` and enter your deployed site origin, for example `https://your-account.github.io`.
4. Deploy using `npx wrangler deploy`.
5. Set the worker URL locally and rebuild:

```bash
VITE_USDA_FOOD_SEARCH_API_URL=https://calorietrack-usda-search.your-subdomain.workers.dev
```

Do not put the USDA key in a `VITE_` variable. Those variables are published to every browser that loads the app.
