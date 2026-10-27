# CalorieTrack

CalorieTrack is a mobile-first Progressive Web App for simple daily calorie and weight tracking. It is designed to work offline, store data locally on the device, and deploy cleanly to GitHub Pages without a backend for normal tracking.

## Features

- First-run onboarding that estimates maintenance calories and a daily target using the Mifflin-St Jeor equation.
- Today dashboard with calorie remaining, manual entry, online USDA food search, a daily football workout, and weight summary.
- Food search works immediately with USDA public access, scales calories by grams or millilitres, and caches recent searches for offline reuse.
- Football training in the Activity tab, with match scheduling, daily readiness, workout logging, kettlebell strength, ball skills, speed/jump foundations, and low-impact endurance.
- Activity tab with an Apple Health daily summary and recorded workouts in the optional [iPhone app](ios/README.md). Automatic HealthKit sync requires the native iPhone app; it is unavailable in browsers.
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

- Calorie entries, weight entries, training preferences, matches, readiness check-ins, workout logs, profile data, and settings are stored in local browser storage on the current device.
- Food queries are sent to USDA (or your configured search Worker). Training data stays on your device. Up to 30 food searches are cached locally for seven days; these disposable results are not included in backups.
- No account, cloud sync, database, Supabase, Firebase, or backend is required for normal tracking.
- Export creates a JSON backup download such as `calorietrack-backup-YYYY-MM-DD.json`.
- Import validates the backup structure before replacing local data. Older backups gain conservative training and empty activity defaults; version 3 backups include training and cached Apple Health summaries. Import leaves Health sync disabled until you reconnect on the device.
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

## Online food search

`Search Food` works without environment configuration by calling [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/) with its intentionally public `DEMO_KEY`. This is real nutrition data, not a mock response. Public access has a small, shared per-IP search allowance; the [general documented limits](https://api.data.gov/docs/rate-limits/) are 30/hour and 50/day, and USDA can impose lower endpoint-specific limits. Use the optional Worker with your own key for regular production usage.

Search runs only when submitted, never on every keystroke. Recent successful searches are cached for seven days (up to 30 queries) and available offline. Requests have a 15-second timeout, cancellation, and clear rate-limit/network/empty-result messages. Search results with missing energy are omitted; zero-calorie foods are supported.

Energy values are kept **per 100 g or 100 ml**, then multiplied by the entered portion. Label serving sizes are offered only when their units are usable; cups/pieces/ounces are not guessed as grams. Kilojoules are never treated as kilocalories. Estimates include the amount and USDA attribution in the saved entry. Prepared meals, oils and sauces still need user review.

### Optional private-key Worker

A Cloudflare Worker keeps your own USDA API key out of the browser. The app uses it when `VITE_USDA_FOOD_SEARCH_API_URL` is set; otherwise it uses public access.

1. Create a free key from the [USDA API guide](https://fdc.nal.usda.gov/api-guide/).
2. From `worker/`, run `npx wrangler login`, then `npx wrangler secret put USDA_API_KEY`.
3. Run `npx wrangler secret put ALLOWED_ORIGIN` and enter your deployed site origin, for example `https://your-account.github.io`.
4. Deploy using `npx wrangler deploy`.
5. Set the worker URL locally and rebuild:

```bash
VITE_USDA_FOOD_SEARCH_API_URL=https://calorietrack-usda-search.your-subdomain.workers.dev
```

Do not put the USDA key in a `VITE_` variable. Those variables are published to every browser that loads the app.


For GitHub Pages, set the repository Actions **variable** `VITE_USDA_FOOD_SEARCH_API_URL` to your deployed Worker URL. The deployment workflow passes it into the build. Never put a private USDA key in a `VITE_` variable. The Worker now shares the frontend's energy normalization; deploy the updated Worker for serving-size/unit support. Older Worker responses are conservatively treated as per 100 g without a suggested serving.

## Football training

Open **Activity** (also linked from Today). The football plan is below the Apple Health summary. The plan is a transparent local rules-based guide, not an AI service or a medical return-to-play assessment.

- Defaults reflect the current equipment: **15 lb and 20 lb kettlebells**, returning-to-training volume, running and jumping disabled, a 60-minute weekly running ceiling, and at most two impact days. The ceiling is an editable planning constraint, not a recommended dose of running.
- Update preferences to choose your level, available bells, running ceiling and impact settings. Running requires explicit enablement and a pain-free check-in on the day; jumping requires an additional opt-in. Shin symptoms pause impact and swap the session for gentle recovery. Endurance uses cycling/swimming or pain-free walking, with seated movement as an alternative.
- Each week starts with **match date unknown**. Wednesday–Sunday stay light for a possible Thursday–Sunday match. Choose **no match** to release those days, or add/edit/remove a fixture at any point. The calendar supports multiple match dates and local kickoff times, and reserves expected playing minutes before adding extra running.
- Two pre-match days are lighter; the first two post-match days are recovery, including across week boundaries. Congested fixtures may reduce kettlebell sessions below two. A fixture is a schedule entry, not clearance to play through pain. Fixtures exceeding your running or impact limits are highlighted.
- On a clear week, the plan includes two spaced kettlebell sessions, ball-control/first-touch drills, aerobic conditioning, and rest. When enabled and appropriate, short controlled accelerations and low jumps replace the impact-free foundations.
- Log completed or skipped sessions, actual duration, running/playing time, effort and shin symptoms. Original session details are saved, so replanning does not rewrite history. A late same-day match can be logged alongside an already completed workout. Missed days do not generate catch-up sessions.
- Apple Health workouts automatically update the plan after syncing in the iPhone app: runs use running and impact limits, football activates match recovery, recorded walks and other conditioning count toward endurance, and strength workouts count toward weekly strength slots. Actual football time replaces that date's fixture reservation. The Today card and Activity plan use the same data.
- Matching manual and Health workouts count once. Automatic matching uses date, type and similar duration; use the workout's **Training log** selector to correct a pairing or count separate sessions. **Add effort & shin feedback** on a synced day records your own feedback without duplicating its load. Steps, ring totals and standing time do not imply intensity or pain-free readiness.
- Progress uses the preceding 14 days of logged workouts. Four manageable work sessions can add one strength repetition per set; recent pain or high effort reduces strength volume. Running limits never increase automatically, and weight loss alone does not unlock impact.

The conservative approach is informed by [NHS shin-splint guidance](https://www.nhs.uk/conditions/shin-splints/), [NSCA return-to-training guidance](https://www.nsca.com/about-us/position-statements/safe-return-to-training/), and [research on post-match recovery](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2021.685804/full). Exact schedules and progression thresholds are app design choices, not a validated individualized rehabilitation protocol.

## Verification

```bash
npm test
npm run build
```

The test suite covers data migration, training backup round trips, match scheduling and cross-week recovery, shin-pain/effort adjustments, synced workout load and duplicate pairing, running budgets, progress rules, food portions/energy units, offline caching, API errors/cancellation, and Worker validation. It uses existing Vite tooling and Node's test runner; no extra test dependencies are needed.
