# World-Class App Roadmap — DoneGrading

Prioritized additions, modifications, and improvements to make DoneGrading production-grade and globally competitive.

---

## 1. Reliability & Observability

### 1.1 Error monitoring (high)

- **Add Sentry (or similar)** for client-side errors.
  - In `ErrorBoundary.componentDidCatch`, call `Sentry.captureException(error)` with optional `extra: { componentStack: info.componentStack }`.
  - Source maps: ensure `dist/*.js.map` are uploaded to Sentry on build (via your chosen CI/CD).
- **Server-side**: If you add API routes later, log and report unhandled rejections.

### 1.2 Real analytics (high)

- **Replace stub in `analytics.ts`** with a real provider:
  - **Google Analytics 4** or **Firebase Analytics** (good fit with existing Firebase).
  - Or **PostHog** / **Plausible** for privacy-friendly product analytics.
- **Events to track**: Keep existing `AnalyticsEvent`; add `page_view`, `grading_session_start`, `scan_capture`, `rubric_created`, `lesson_generated`, `message_sent`, and optional `paywall_view` / `subscription_start`.
- **Respect consent**: Gate analytics on cookie/consent banner if required (e.g. GDPR).

### 1.3 Health & resilience (medium)

- **API retries**: For Gemini and Google APIs, add retry with backoff (e.g. `retry` or custom wrapper) for 429/5xx.
- **Timeout handling**: Set timeouts on fetch calls to Gemini/Classroom; show a clear “Request timed out” and retry option.
- **Offline queue**: Persist “sync to Classroom” and “send email” actions when offline; retry when back online (you already have `gradedWorks` in localStorage; formalize a small queue and process it on `online`).

---

## 2. Testing

### 2.1 Unit tests (high)

- **Add Vitest** (fits Vite):
  - `npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom`
  - Config in `vite.config.ts` or `vitest.config.ts`.
- **Test targets**:
  - `utils/safeParseJson` (valid, invalid, null).
  - `services/contactLogSheets.parseSheetId` (URL, raw ID, invalid).
  - `services/geminiService` (mock `fetch` / `GoogleGenAI`, assert request shape and that malformed JSON returns null).
  - Key hooks or small components (e.g. theme toggle, a single view) with `@testing-library/react`.
- **Script**: `"test": "vitest"`, `"test:run": "vitest run"`.

### 2.2 E2E tests (medium)

- **Playwright** (or Cypress): Sign-in flow (demo or mocked Google), select course → assignment → rubric setup → one scan → audit → sync. Run in CI on a schedule or per PR.

### 2.3 Visual regression (low)

- **Chromatic** or **Percy** for critical screens (auth, dashboard, grading loop) to catch unintended UI changes.

---

## 3. Performance

### 3.1 Bundle size (high)

- **Code-split by route/phase**: Lazy-load `AuthView`, `CommunicationDashboard`, Plan view, Grading loop, etc.:
  - `const AuthView = lazy(() => import('./views/AuthView'))` and wrap in `<Suspense fallback={<LoadingSpinner />}>`.
- **Vite manual chunks**: In `vite.config.ts`, use `build.rollupOptions.output.manualChunks` to split `vendor` (react, lucide), `gemini`, `classroom`, etc., so the main bundle stays smaller and caches better.
- **Tailwind**: Replace CDN Tailwind in `index.html` with the Tailwind Vite plugin and purge unused styles so CSS is minimal in production.

### 3.2 Runtime (medium)

- **Memoize heavy lists**: For dashboard course/assignment lists and history, ensure lists are memoized (you already have `dashboardResults` / `filteredAssignmentsList`); avoid re-rendering large lists on every keystroke.
- **Image handling**: If you show many scan thumbnails, use lazy loading (`loading="lazy"`) or a virtual list for very long lists.
- **Debounce**: Debounce search inputs (e.g. `globalSearchQuery`, assignment search) to limit re-renders and optional API calls.

---

## 4. Security & Compliance

### 4.1 Security headers (high)

- **Content-Security-Policy (CSP)** on your hosting platform (e.g. Firebase Hosting or App Hosting): Restrict script sources, inline, and `connect` to your API and Google/Gemini only. Reduces XSS risk.

### 4.2 Token handling (medium)

- **Google OAuth**: Prefer short-lived access tokens and refresh when possible (e.g. backend token endpoint or Google’s refresh flow) instead of long-lived tokens in memory only.
- **Sensitive data**: Ensure no PII (student names, emails) or tokens are logged in analytics or Sentry; use Sentry’s `beforeSend` to scrub.

### 4.3 Environment (medium)

- **Audit env usage**: All secrets and keys only via env (you already use `VITE_*`). Add a small “env check” on app init that warns in dev if required keys are missing (e.g. `VITE_GEMINI_API_KEY`).

---

## 5. Accessibility (a11y)

### 5.1 Basics (high)

- **Focus management**: After phase changes (e.g. into grading loop or audit), move focus to the main heading or first control (`ref` + `useEffect`).
- **Labels**: Ensure every form field has a visible or `aria-label`; buttons that are icon-only have `aria-label` (you have some; audit all).
- **Color contrast**: Check WCAG AA for text and buttons (e.g. slate on white, indigo buttons); fix any failing combinations.
- **Screen reader**: Test with VoiceOver (Mac/iOS) or NVDA; fix order and live regions (e.g. sync status, scan result).

### 5.2 Keyboard & navigation (medium)

- **Escape**: Close modals (e.g. voice capture, sheet picker) on Escape.
- **Tab order**: Logical tab order in grading flow and communicate form.
- **Skip link**: “Skip to main content” at the top for keyboard users.

---

## 6. User Experience (UX)

### 6.1 Onboarding (high)

- **First-time flow**: Short 2–3 step onboarding (e.g. “Connect Classroom” → “Pick a class” → “Scan one paper”) with clear CTAs and optional “Skip”.
- **Empty states**: Dedicated copy and illustration for “No courses yet”, “No assignments”, “No grades to sync” with actions (e.g. “Create course”, “Start grading”).

### 6.2 Loading & errors (high)

- **Skeletons**: Replace generic spinners with skeleton placeholders for dashboard, assignment list, and thread list.
- **Inline errors**: Show API errors (Classroom, Gemini, Gmail) inline with “Retry” and short message; avoid only toasts that disappear.
- **Offline banner**: You have one; consider a small persistent indicator (e.g. “Offline – changes will sync when back online”) and disable sync/email actions when offline with a tooltip.

### 6.3 Grading flow (medium)

- **Haptics**: On mobile (Capacitor), trigger light haptic on “Capture” and on “Match confirmed” for tactile feedback.
- **Undo**: “Undo last grade” in the grading loop or audit step (remove from queue and optionally re-scan).
- **Batch actions**: In audit, “Select all” / “Deselect” and “Sync selected” for partial sync.

---

## 7. Internationalization (i18n)

### 7.1 Framework (medium)

- **react-i18next** (or similar): Extract all user-facing strings into JSON by locale (`en`, `es` at minimum for your audience).
- **RTL**: If you ever support RTL, structure CSS with logical properties or use a small RTL layer.
- **Dates/numbers**: Use `Intl.DateTimeFormat` and `Intl.NumberFormat` with user locale (you already use `toLocaleDateString` in places; standardize).

### 7.2 Copy (low)

- **Communicate templates**: You have English/Spanish; ensure language toggle is clear and persisted per user/session.

---

## 8. DevOps & Quality

### 8.1 CI/CD (high)

- **GitHub Actions** (or similar):
  - On push/PR: `npm ci`, `npm run test:run`, `npm run build`.
  - Lint: `npm run lint` (add ESLint if not present).
  - Optional: E2E on a schedule or on release branch.

### 8.2 Linting & formatting (high)

- **ESLint**: `npm i -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks`; config that extends `typescript-eslint` and React recommended; enable `react-hooks/exhaustive-deps` and fix critical rules.
- **Prettier**: `npm i -D prettier`; format on save or pre-commit. Add `"format": "prettier --write ."` and optionally `format:check` in CI.
- **Pre-commit**: Husky + lint-staged to run lint and format on staged files.

### 8.3 Dependency hygiene (medium)

- **Audit**: `npm audit` in CI; fix or suppress only with justification.
- **Renovate or Dependabot**: Automated PRs for dependency updates; review and merge regularly.

---

## 9. Feature Completeness (from ARCHITECTURE)

### 9.1 Plan tab (medium)

- **Standards API**: Replace placeholder standards with a real API (e.g. state/national standards) and persist “pinned” standards to plan state.
- **Resource curation**: AI-powered resource suggestions based on topic/grade instead of (or in addition to) hardcoded cards.
- **Export**: Export lesson plan to Google Docs or PDF.

### 9.2 Grading (medium)

- **Rubric templates**: Save and reuse rubric “quick picks” per teacher or per course.
- **Batch export**: Export feedback (e.g. PDF per student or one PDF) for records or printing.
- **Offline grading**: Explicit “queue for sync” when offline with clear status (“3 pending sync”) and retry.

### 9.3 Communicate (medium)

- **One-tap send**: Integrate SMS/email (e.g. Twilio, or Gmail API for email) so teachers can send from the app instead of copy-only.
- **Student selector**: Dropdown populated from Classroom roster (you have students in context; wire to template “To” field).
- **Archive**: List of recent sent messages or contact log entries for reference.

### 9.4 Classroom / Command Center (low)

- **Persist behavior**: Save behavior scores to Google Sheets or a simple backend so they’re not lost on refresh.
- **Real noise meter**: Use `navigator.mediaDevices.getUserMedia` and AnalyserNode to show live level instead of slider-only.

---

## 10. Product & Trust

### 10.1 Subscription & paywall (high if monetizing)

- **Stripe (or similar)**: Replace stubbed `subscriptionStatus` with real subscription checks; gate premium features (e.g. multi-page grading, AI lesson gen) behind plan.
- **Restore purchases**: On app load, validate subscription server-side or via Stripe Customer Portal; sync status to client.

### 10.2 Legal & trust (medium)

- **Terms / Privacy**: You link to donegrading.com; ensure pages exist and cover data processed (Google, Gemini, Firebase), retention, and user rights (access, delete).
- **Cookie/consent**: If you use non-essential cookies or analytics in regulated regions, add a simple consent banner and gate analytics accordingly.

### 10.3 Support (medium)

- **In-app help**: “Help” or “?” that opens a short FAQ or link to docs/support email (you already mention donegrading@gmail.com).
- **Status page**: Simple status page (e.g. Google Cloud status or a lightweight hosted status page) linked from footer so users know if issues are on your side.

---

## 11. Codebase Health

### 11.1 Continue App split (high)

- **Extract remaining phases** into views (Dashboard, Plan, Classroom, GradingLoop, Audit, Syncing, Finale, etc.) using `AppContext` and optional sub-contexts so `App.tsx` shrinks to a thin shell and router.
- **Shared hooks**: Extract `useOnline`, `useDarkMode`, `useSyncStatus` and any repeated logic into hooks.

### 11.2 Design system (medium)

- **Tokens**: You have `uiStyles.ts`; consider a small design-token file (colors, spacing, radii) and use it in Tailwind config so light/dark and future themes stay consistent.
- **Components**: Reusable `Button`, `Card`, `Input`, `Modal` that wrap your tokens and a11y behavior (focus, aria).

### 11.3 Documentation (low)

- **README**: Add “Architecture” link, env vars table, and “Running tests”.
- **JSDoc**: Add brief JSDoc for public service functions and context types so IDE and future maintainers understand contracts.

---

## Priority summary

| Priority | Area          | Top actions                                              |
| -------- | ------------- | -------------------------------------------------------- |
| **P0**   | Reliability   | Sentry (or similar), real analytics, retries/timeouts    |
| **P0**   | Testing       | Vitest + unit tests for utils and services               |
| **P0**   | Performance   | Code-split + Tailwind build, reduce main bundle          |
| **P1**   | Security      | CSP and security headers, env check                      |
| **P1**   | Accessibility | Focus, labels, contrast, keyboard                        |
| **P1**   | UX            | Onboarding, skeletons, inline errors, offline clarity    |
| **P1**   | DevOps        | CI (test + build), ESLint, Prettier, pre-commit          |
| **P2**   | Features      | Offline queue, one-tap send, rubric templates, standards |
| **P2**   | i18n          | react-i18next, extract strings, locale for date/number   |
| **P2**   | Codebase      | Extract remaining views, shared hooks, design tokens     |
| **P3**   | Subscription  | Stripe (or similar), restore purchases                   |
| **P3**   | E2E / visual  | Playwright, optional Chromatic                           |

Implementing in this order will move DoneGrading toward a world-class, production-ready app while keeping scope manageable.
