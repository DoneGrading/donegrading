<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally and **as a mobile app** (iOS & Android).

View your app in AI Studio: https://ai.studio/apps/4f5b250b-1758-4177-8df6-40c514634046

## Run Locally (Web)

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set your Gemini API key: copy `.env.example` to `.env.local` and set `VITE_GEMINI_API_KEY` (get a key from [Google AI Studio](https://aistudio.google.com/apikey)).
3. Run the app:
   ```bash
   npm run dev
   ```
   Open http://localhost:5173.

## Architecture & docs

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — App structure, navigation, and workflow (Plan, Grade, Class, Communicate).
- **[WORLD_CLASS_ROADMAP.md](WORLD_CLASS_ROADMAP.md)** — Roadmap for production-grade improvements.

### Environment variables

| Variable                   | Required      | Description                                                                 |
| -------------------------- | ------------- | --------------------------------------------------------------------------- |
| `VITE_GEMINI_API_KEY`      | Yes           | Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). |
| `VITE_GOOGLE_CLIENT_ID`    | For Classroom | Google OAuth client ID (Cloud Console).                                     |
| `VITE_FIREBASE_API_KEY`    | Optional      | Firebase Web API key (threads / push).                                      |
| `VITE_FIREBASE_PROJECT_ID` | Optional      | Firebase project ID.                                                        |
| `VITE_SENTRY_DSN`          | Optional      | Sentry DSN for error monitoring.                                            |

Copy `.env.example` to `.env.local` and fill in values.

### Billing (Stripe)

Premium sync/email features use **Stripe Checkout** (subscription mode). Configure these on the machine that runs **`node server.js`** (not in the Vite-only dev bundle):

| Variable                 | Required | Description                                                                 |
| ------------------------ | -------- | --------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`      | Yes\*    | Secret key from the Stripe Dashboard.                                       |
| `STRIPE_PRICE_ID`        | Yes\*    | Recurring **Price** ID (`price_…`) for your Pro plan.                         |
| `APP_ORIGIN`             | Yes\*    | Public site URL for success/cancel redirects (e.g. `http://localhost:5173` with Vite + proxy). |
| `STRIPE_WEBHOOK_SECRET`  | Optional | For `POST /api/billing/webhook` (e.g. `stripe listen --forward-to …`).      |

\*If unset, checkout returns 503 and the paywall shows a configuration message.

**Local dev:** Terminal 1 — `PORT=8080 STRIPE_SECRET_KEY=… STRIPE_PRICE_ID=… APP_ORIGIN=http://localhost:5173 node server.js`. Terminal 2 — `npm run dev`. Vite proxies `/api/*` to port 8080.

**Production:** `npm run build && npm start` (or your host). Set `APP_ORIGIN` to your real HTTPS origin. Subscription status is stored in `localStorage` after a successful return; webhooks log events today—wire to your user store when you add accounts + billing portal.

### Running tests

```bash
npm run test        # Unit tests (Vitest) — watch mode
npm run test:run    # Unit tests — single run
npm run test:e2e    # E2E tests (Playwright; starts dev server)
npm run lint        # ESLint
npm run format:check # Prettier check
```

---

## Mobile App (iOS & Android)

The project is set up with **Capacitor** so you can build and run native iOS and Android apps. See **[MOBILE.md](MOBILE.md)** for:

- Building and syncing to native projects
- Opening the app in Android Studio or Xcode
- Adding your API key for mobile builds
- Adding the iOS platform (requires CocoaPods on Mac)
