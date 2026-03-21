# WORLD_CLASS_ROADMAP — Implementation Summary

This document summarizes what was implemented from **WORLD_CLASS_ROADMAP.md**. Run `npm install` and then the commands below to verify (requires sufficient disk space).

---

## 1. Reliability & Observability

- **Sentry** (`lib/sentry.ts`): Optional; set `VITE_SENTRY_DSN` to enable. `initSentry()` in `main.tsx`. `ErrorBoundary` calls `captureException()` with PII scrubbing in `beforeSend`.
- **Analytics** (`analytics.ts`): Extended event types (`page_view`, `grading_session_start`, `scan_capture`, `rubric_created`, `lesson_generated`, `message_sent`, `paywall_view`, `subscription_start`). Consent gate: `getAnalyticsConsent()` / `setAnalyticsConsent()`; `logEvent` no-ops when consent is false.
- **Retry** (`lib/retry.ts`): `withRetry(fn, { maxAttempts, delayMs, backoff, retryable })` for 5xx/429.
- **Timeout** (`lib/fetchWithTimeout.ts`): `fetchWithTimeout(url, { timeoutMs })` for fetch calls. _Wire into `classroomService` / Gemini call sites as needed._
- **Offline queue**: Existing `gradedWorks` in localStorage is the queue; sync runs when online. No new queue type added; documented in roadmap.

---

## 2. Testing

- **Vitest**: Config in `vite.config.ts` (test env: jsdom, setup: `tests/setup.ts`). Scripts: `npm run test`, `npm run test:run`.
- **Unit tests**: `utils/safeParseJson.test.ts`, `services/contactLogSheets.test.ts` (parseSheetId).
- **Playwright**: `playwright.config.ts`, `e2e/auth.spec.ts` (home load, skip link, demo login). Scripts: `npm run test:e2e`, `npm run test:e2e:ui`.
- **Visual regression**: Not implemented (Chromatic/Percy require external accounts).

---

## 3. Performance

- **Tailwind**: CDN removed; `global.css` with `@tailwind` + `tailwind.config.js` + `postcss.config.js`. Built via Vite PostCSS.
- **Code-split**: `vite.config.ts` `manualChunks`: `vendor` (react, react-dom), `lucide`, `gemini`. Lazy-loaded views can be added later (e.g. `lazy(() => import('./views/AuthView'))`).
- **Debounce**: `hooks/useDebounce.ts` and `useDebouncedCallback`. _Use in dashboard/assignment search inputs where needed._

---

## 4. Security

- **Headers**: Recommended security headers such as `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, and a strict `Content-Security-Policy` (script/style/connect/font/img/frame sources) can be applied at the hosting layer (e.g. Firebase Hosting/App Hosting config).
- **Env check** (`lib/envCheck.ts`): `checkEnv()` in `main.tsx`; warns in dev if `VITE_GEMINI_API_KEY` is missing.
- **PII scrub**: Sentry `beforeSend` redacts Bearer tokens, emails, and name-like strings.

---

## 5. Accessibility

- **Skip link**: In `index.html`, `<a href="#main-content" class="skip-link">Skip to main content</a>`. App root div has `id="main-content"` and `tabIndex={-1}` for focus target.
- **Labels**: Existing `aria-label` on theme toggle and others; new components (ConsentBanner, Onboarding, InlineError) use semantic markup. Full audit left for manual pass.
- **Escape for modals**: Not wired per modal; add `useEffect` with `key === 'Escape'` in voice capture and sheet picker if desired (see roadmap).

---

## 6. UX

- **Onboarding** (`components/Onboarding.tsx`): 3-step flow (Connect Classroom → Pick class → Scan); Skip / Get started. Shown when `!hasCompletedOnboarding()`; state in `App.tsx`.
- **Consent banner** (`components/ConsentBanner.tsx`): Accept/Decline analytics; rendered in App.
- **Empty states** (`components/EmptyState.tsx`): Reusable title/description/action; use in dashboard for “No courses”, “No assignments”, etc.
- **Skeletons** (`components/Skeleton.tsx`): `SkeletonCard`, `SkeletonList`, `SkeletonText`; use where loaders are shown.
- **Inline errors** (`components/InlineError.tsx`): Message + optional Retry button; use for API errors.
- **Offline**: Existing banner; roadmap suggests persistent “Offline – changes will sync” indicator (optional).
- **Haptics** (`lib/haptics.ts`): `lightHaptic()`, `successHaptic()` for Capacitor; no-op on web. Call on capture/confirm in grading flow.

---

## 7. Internationalization

- **react-i18next**: `i18n/index.ts` initializes with `en` and `es`; locale from `localStorage.getItem('dg_lang')` or `en`. Locales in `i18n/locales/en.json`, `i18n/locales/es.json`.
- **main.tsx**: Imports `./i18n` before React. Use `useTranslation()` in components and replace copy with `t('key')` where needed.

---

## 8. DevOps

- **ESLint**: `eslint.config.js` (flat config, TypeScript + react-hooks). Scripts: `npm run lint`, `npm run lint:fix`.
- **Prettier**: `.prettierrc.json`, `.prettierignore`. Scripts: `npm run format`, `npm run format:check`.
- **lint-staged**: In `package.json`; runs ESLint + Prettier on staged `.ts,.tsx` and Prettier on `.json,.md`.
- **Husky**: `"prepare": "husky || true"`. Run `npx husky init` once to add pre-commit hook that runs lint-staged.
- **CI** (`.github/workflows/ci.yml`): On push/PR to main/master — install, lint, format check, unit tests, build, npm audit (continue-on-error). E2E job runs Playwright (chromium) after lint-test-build.

---

## 9. Features

- **Rubric templates** (`lib/rubricTemplates.ts`): `getRubricTemplates(userId)`, `saveRubricTemplate()`, `deleteRubricTemplate()`; localStorage, keyed by user.
- **Standards API**: Placeholder only; wire real API in Plan tab and persist pinned standards in existing plan state (see ARCHITECTURE).
- **Export plan**: Not implemented; roadmap suggests Google Docs/PDF (backend or client lib).
- **Help** (`components/HelpLink.tsx`): FAQ link, support email, Google status link; use in settings or footer.
- **One-tap send / Student selector / Archive**: Not implemented; roadmap suggests Twilio/Gmail and roster dropdown (students already in context).
- **Behavior persist / Real noise meter**: Not implemented; roadmap suggests Sheets and `getUserMedia` + AnalyserNode.

---

## 10. Product & Trust

- **Consent**: Implemented via `ConsentBanner` and `analytics.ts` consent flag.
- **Stripe**: Not implemented; keep stubbed `subscriptionStatus` and add Stripe when ready (see roadmap).
- **Terms/Privacy**: Linked from auth screen; ensure donegrading.com pages exist.

---

## 11. Codebase

- **Hooks**: `hooks/useDebounce.ts`, `hooks/useOnline.ts`. Use in App or views to replace inline logic.
- **Design tokens**: `design/tokens.ts` (colors, radius, spacing); use in Tailwind or inline.
- **Reusable components**: `EmptyState`, `Skeleton*`, `InlineError`, `ConsentBanner`, `Onboarding`, `HelpLink`. Add `Button`/`Card`/`Modal` wrappers as needed (see uiStyles + tokens).
- **README**: Updated with Architecture link, env vars table, and “Running tests”.

---

## Quick commands

```bash
npm install
npm run lint
npm run format:check
npm run test:run
npm run build
npm run test:e2e    # optional; needs Playwright browsers
npx husky init     # once, to enable pre-commit hooks
```

If you see **ENOSPC (no space left on device)** during build or tests, free disk space and re-run.
