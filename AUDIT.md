# Codebase Audit — DoneGrading

**Date:** March 5, 2025  
**Scope:** All application and config files (TypeScript/TSX, JS, HTML, configs, Android).

---

## 1. Executive Summary

- **Stack:** Vite + React 19 + TypeScript, Google Classroom/Gmail/Drive/Sheets, Gemini AI, Firebase (optional), Capacitor (Android).
- **Findings:** No critical security vulnerabilities (no `eval`/`dangerouslySetInnerHTML`). Several **high** and **medium** items: entry-point inconsistency, hardcoded OAuth client ID, fragile `localStorage`/JSON parsing, Drive query string construction, and one very large component. The rest are **low**/cleanup items.

---

## 2. Entry Points & Bootstrap

| File | Role | Issue |
|------|------|--------|
| `index.html` | Loads `/main.tsx` | **Only** `main.tsx` is used as entry. |
| `main.tsx` | Renders `<App />` in StrictMode | Does **not** wrap app in `ErrorBoundary`. |
| `index.tsx` | Renders `<ErrorBoundary><App /></ErrorBoundary>` | **Dead code** — never loaded by `index.html`. |

**Recommendation:** Either switch `index.html` to load `index.tsx` so the app runs inside `ErrorBoundary`, or move the ErrorBoundary wrapper into `main.tsx` and keep a single entry. Prefer one entry file.

---

## 3. Security

### 3.1 Hardcoded OAuth Client ID (High)

- **Where:** `App.tsx` line ~396  
- **Code:** `const GOOGLE_CLIENT_ID = '137273476022-4il1dq3mj28v0g1c2t59mt3l341evlbl.apps.googleusercontent.com';`
- **Risk:** Client IDs are generally considered public in OAuth 2.0, but hardcoding prevents environment-specific config and makes rotation harder.
- **Recommendation:** Move to env, e.g. `VITE_GOOGLE_CLIENT_ID`, with a fallback only for development, and document in `.env.example`.

### 3.2 API Keys

- **Gemini:** Correctly read from `import.meta.env.VITE_GEMINI_API_KEY` (and optional `process.env.API_KEY` for server). No keys in repo.
- **Firebase:** Read from `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_PROJECT_ID`. Appropriate for client-side Firebase.
- **.env.example:** Documents required/optional vars; no secrets. Good.

### 3.3 Email/Password on Login Screen

- **Where:** `App.tsx` — `email`/`password` state and form.
- **Behavior:** Form submit calls `loginMock()` which only enables demo mode; credentials are not sent to any backend.
- **Note:** If a real email/password backend is added later, ensure HTTPS and secure credential handling.

### 3.4 Drive Query String (Medium)

- **Where:** `App.tsx` — `getOrCreateDriveFolder(token, folderName, parentId)`.
- **Code:** `let query = \`... name='${folderName}' ...\`;` then `encodeURIComponent(query)`.
- **Risk:** If `folderName` (or `parentId`) contains a single quote (e.g. `Teacher's Folder`), the Drive query string can break or behave unexpectedly.
- **Recommendation:** Escape single quotes in `folderName`/`parentId` before building the query, or use a safer encoding approach.

### 3.5 No Dangerous Patterns

- No `eval`, `dangerouslySetInnerHTML`, or `document.write` found.

---

## 4. Reliability & Data Handling

### 4.1 localStorage + JSON.parse (Medium)

Many initial state values use:

```ts
const saved = localStorage.getItem('key');
return saved ? JSON.parse(saved) : defaultValue;
```

If stored data is corrupted or from an older schema, `JSON.parse` can throw and crash the component. **Already wrapped in try/catch in some places** (e.g. `gradeFollowUps`, `quickTodos`, `loadPersistedState` in CommunicationDashboard), but not everywhere.

**Files/locations:**

- `App.tsx`: `dg_dark_mode`, `dg_cache_courses`, `dg_cache_assignments`, `dg_cache_students`, `dg_pending_sync`, `dg_history`, `dg_dash_sort`, `dg_asn_sort`, `PLAN_US_STATE_KEY`, etc.
- `CommunicationDashboard.tsx`: `THREADS_LAST_SEEN_KEY` (line ~335) — `raw ? JSON.parse(raw) : {}` with no try/catch.
- `firebaseThreadsRest.ts`: `loadFirebaseSession()` — `JSON.parse(raw)` inside try/catch. OK.

**Recommendation:** Use a small helper, e.g. `safeParseJson<T>(raw: string | null, fallback: T): T`, and use it for all localStorage reads.

### 4.2 Gemini / API Response Parsing

- **geminiService.ts:** Several places use `JSON.parse(text)` after extracting JSON with a regex fallback. Some have try/catch (e.g. `assessFrame`, `generateLessonScript`); `analyzePaper` and `analyzeMultiPagePaper` parse without try/catch. If the model returns malformed JSON, this can throw.
- **Recommendation:** Wrap in try/catch and return `null` or throw a clear error so callers can handle failure.

---

## 5. Code Quality & Maintainability

### 5.1 App.tsx Size (High)

- **Size:** ~4,700+ lines in a single component.
- **Impact:** Hard to navigate, test, and refactor; risk of merge conflicts and regression.
- **Recommendation:** Split by phase or feature: e.g. AuthScreen, DashboardView, GradingLoopView, PlanView, ClassroomView, AuditView, etc. Share state via context or props; keep each file under a few hundred lines.

### 5.2 CommunicationDashboard.tsx

- ~1,186 lines. Still large but more scoped. Consider extracting sub-views (e.g. ThreadList, MessageComposer, ContactLogForm) into separate files.

### 5.3 useSpeechToText Stale Closure (Low)

- **Where:** `App.tsx` — `useSpeechToText(onResult)`.
- **Issue:** `onResult` is in the effect dependency array. If the caller passes an inline function, the effect re-runs and re-creates `SpeechRecognition` on every render where that function identity changes.
- **Recommendation:** Use `useRef(onResult)` and invoke `ref.current` in the callback, or memoize `onResult` with `useCallback` at the call site.

### 5.4 ErrorBoundary

- **ErrorBoundary.tsx:** Correctly implements `getDerivedStateFromError` and `componentDidCatch`. Renders a friendly “Something went wrong” and “Reload app” — good UX. As noted above, it is not used because the entry is `main.tsx`.

### 5.5 TypeScript

- **tsconfig.json:** `strict: true`, `noUnusedLocals: false`, `noUnusedParameters: false`. Consider enabling the two `noUnused*` options to catch dead code.
- **types.ts:** Clear enums and interfaces; `GeometricData` and `GradingResponse` align with geminiService usage.

---

## 6. Services

### 6.1 geminiService.ts

- **getApiKey():** Supports both Vite and Node-style env. Good.
- **Model:** Uses `gemini-3-flash-preview` throughout. If the API deprecates or renames this, update in one place (consider a constant).
- **Error handling:** Most functions catch and return `null`; some log to console. Consistent. Adding try/catch around JSON.parse where missing would improve robustness.

### 6.2 classroomService.ts

- **ClassroomService:** Clean async/await, proper error mapping (e.g. “Failed to fetch” → user-friendly message).
- **postGrade:** Correctly fetches submission by `userId`, then PATCHes `draftGrade` and `assignedGrade`. Comment about private comment is accurate (API may not support it in all contexts).
- **sendGradeEmail:** Builds MIME manually; slices images to 10. No obvious injection; `toEmail`/subject/body are passed to Gmail API. Ensure any user-controlled content is validated/sanitized if it ever comes from untrusted input.

### 6.3 firebaseThreadsRest.ts

- Session load/save with expiry check; Firestore REST via `toValue`/`fromValue`. Structure is clear. Token refresh not implemented (session expiry only); document or add refresh when needed.

### 6.4 contactLogSheets.ts

- **parseSheetId:** Handles URL and raw ID safely.
- **createContactLogSheet / appendContactLog:** Use Bearer token and proper error handling. Sheet name in append is escaped for single quotes in A1 notation — good.

---

## 7. Server & Deployment

### 7.1 server.js

- Express serves static from `__dirname` and SPA fallback to `index.html`. For production, ensure `__dirname` points at the built output (e.g. `dist`) or run after `npm run build` and set static path to `dist`. Otherwise the server may serve source instead of built assets.

### 7.3 vite.config.ts

- React plugin, `outDir: 'dist'`, sourcemaps, port 5173. No issues.

### 7.4 capacitor.config.ts

- `webDir: 'dist'`, `androidScheme: 'https'`. Sensible.

---

## 8. Android

- **AndroidManifest.xml:** INTERNET and CAMERA permissions; camera not required. MainActivity is launcher; FileProvider configured. No obvious issues.
- **MainActivity.java:** Extends `BridgeActivity`; minimal and correct.

---

## 9. HTML & Assets

### 9.1 index.html

- Tailwind via CDN; dark mode and font config inlined. For production, consider bundling Tailwind to reduce external dependencies and control caching.
- Google GSI and Apple Sign-In scripts loaded. Ensure CSP or script integrity if you lock down security later.
- No sensitive data in HTML.

### 9.2 declarations.d.ts

- Declares `*.png` module. Adequate.

---

## 10. Analytics & UI

- **analytics.ts:** Stub that logs to console. Ready to swap for a real provider. No PII logged in the stub.
- **uiStyles.ts:** Shared design tokens; used by App and CommunicationDashboard. Good for consistency.

---

## 11. Checklist Summary

| Category | Finding | Severity |
|----------|--------|----------|
| Entry | index.tsx unused; ErrorBoundary not in use | High |
| Security | GOOGLE_CLIENT_ID hardcoded | High |
| Security | Drive query: folderName/parentId quote escaping | Medium |
| Reliability | localStorage JSON.parse without try/catch in several places | Medium |
| Reliability | Some Gemini JSON.parse without try/catch | Low |
| Maintainability | App.tsx ~4700 lines | High |
| Maintainability | CommunicationDashboard ~1186 lines | Medium |
| TS | noUnusedLocals / noUnusedParameters disabled | Low |
| Server | server.js static path vs dist | Low (verify) |

---

## 12. Recommended Action Order

1. **Use ErrorBoundary:** Point `index.html` to `index.tsx` or add ErrorBoundary in `main.tsx` and remove the duplicate entry.
2. **Move Google Client ID to env:** `VITE_GOOGLE_CLIENT_ID` and document in `.env.example`.
3. **Harden localStorage reads:** Introduce `safeParseJson` and use it everywhere state is restored from localStorage.
4. **Escape Drive query:** Sanitize `folderName` and `parentId` in `getOrCreateDriveFolder` (e.g. escape single quotes).
5. **Split App.tsx:** Extract phase-specific or feature-specific components and shared state (context/hooks).
6. **Optional:** Enable `noUnusedLocals` and `noUnusedParameters` in tsconfig; fix any new warnings.
7. **Optional:** Add try/catch around all Gemini `JSON.parse` and standardize error handling (e.g. return null + log).

---

---

## 13. Implementation Status (Post-Audit)

The following recommendations were implemented:

- **ErrorBoundary:** Wrapped app in `main.tsx` with `<ErrorBoundary><App /></ErrorBoundary>` so the active entry uses it.
- **Google Client ID:** Moved to `VITE_GOOGLE_CLIENT_ID` in `.env.example`; App reads from `import.meta.env.VITE_GOOGLE_CLIENT_ID` with a dev fallback.
- **safeParseJson:** Added `utils/safeParseJson.ts` and used it for all `localStorage` + `JSON.parse` in App, CommunicationDashboard, and firebaseThreadsRest.
- **Drive query:** `getOrCreateDriveFolder` now escapes single quotes in `folderName` and `parentId` via `escapeDriveQueryValue()`.
- **Gemini JSON.parse:** Wrapped `analyzePaper` and `analyzeMultiPagePaper` response parsing in try/catch with regex fallback.
- **TypeScript:** Enabled `noUnusedLocals` and `noUnusedParameters` in tsconfig; fixed unused imports and variables (prefix with `_` or remove).
- **App split:** Extracted `components/PageWrapper.tsx`, `context/AppContext.tsx`, and `views/AuthView.tsx`; App provides `AppContext.Provider` and renders `<AuthView />` for the AUTHENTICATION phase. Further phases can be extracted the same way.

*End of audit.*
