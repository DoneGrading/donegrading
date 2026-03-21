# UI consistency audit (DoneGrading)

**Scope:** Colors, layout, typography, spacing, safe areas, dark mode, and cross-screen patterns after the full-viewport update.

## Summary

| Area                     | Status  | Notes                                                                                           |
| ------------------------ | ------- | ----------------------------------------------------------------------------------------------- |
| **Safe areas / notches** | Good    | `PageWrapper` + bottom nav + consent banner use `env(safe-area-inset-*)`.                       |
| **Viewport / overflow**  | Good    | `html`/`body`/`#root` use `100dvh` where supported; `min-h-0` on flex chains.                   |
| **Design tokens**        | Partial | `uiStyles.ts` exists but **App.tsx** mostly uses inline Tailwind; Communicate uses tokens more. |
| **Page chrome**          | Good    | Single `PageWrapper` pattern; header scales `sm`/`md`.                                          |
| **Bottom navigation**    | Good    | Full-width, safe bottom inset; align content `pb` in `PageWrapper` with bar height.             |

---

## Findings by severity

### Medium — consistency

1. **`uiStyles.ts` underused in App.tsx**
   - **Plan** and many dashboard cards repeat strings like `rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/80` with small variations (`/85`, `/90`, `/95`, `rounded-2xl` vs `rounded-xl`).
   - **Risk:** Visual drift when editing one screen and not others.
   - **Recommendation:** Gradually replace repeated panel/input strings with `card`, `cardTight`, `input`, `textarea` from `uiStyles.ts`, or add `cardPanel`, `cardPanelLg` for `rounded-2xl p-4` variants.

2. **Accent colors differ by feature**
   - Primary actions mix **indigo**, **sky**, **emerald**, **violet** (e.g. Communicate log button uses violet).
   - **Recommendation:** Reserve **indigo** for global primary; use **sky** for Plan/AI; keep semantic colors (emerald success, red error, amber offline).

3. **Section titles**
   - Plan uses imported `sectionTitle` from `uiStyles` — good.
   - Other areas sometimes use ad-hoc `text-[9px] font-bold uppercase` — align to `sectionTitle` or a single `subsectionTitle` token.

### Low — polish

4. **`PageWrapper` props `syncStatus` / `onSyncClick` / `isOnline`**
   - **Update:** Header now shows a small **status dot** (amber offline, rose sync error, green online/synced). **Retry** appears when `onSyncClick` is passed and `syncStatus === 'error'` (e.g. Dashboard).
   - Screens that don’t pass `onSyncClick` still get online/offline + idle vs ok coloring.

5. **Border radius mix**
   - `rounded-xl` vs `rounded-2xl` vs `rounded-3xl` and `rounded-none` on small breakpoints (modals) — intentional for hierarchy but undocumented.
   - **Recommendation:** Document: **xl** = inputs/chips, **2xl** = cards, **3xl** = modals/hero.

6. **Bottom nav label size**
   - Was `text-[7px]` — very small on dense displays; bumped in code to **8px / 9px** responsive for readability.

### Compatibility / reliability

7. **iOS / PWA**
   - `viewport-fit=cover` + safe-area — good.
   - `apple-mobile-web-app-capable` set in app `index.html`.
   - **Note:** Pinch-zoom allowed (accessibility); some marketing sites disable it — current choice is correct for a11y.

8. **Print**
   - `#dg-bottom-nav` hidden in print — good.
   - Plan has dedicated print styles — verify when changing global layout.

9. **`max-w-[min(100%,22rem)]`**
   - Valid Tailwind v3 arbitrary value — builds clean; safe for production.

---

## Checklist for new screens

- [ ] Use `PageWrapper` for full-screen phases (or document exception).
- [ ] Prefer `sectionTitle`, `label`, `input` / `textarea` from `uiStyles.ts`.
- [ ] Card: `card` or `cardTight` unless you need a documented variant.
- [ ] Respect safe area: no fixed UI in the bottom `4.5rem` + inset without `env(safe-area-inset-bottom)`.
- [ ] Dark mode: pair `bg-white/…` with `dark:bg-slate-900/…` and `border-slate-200 dark:border-slate-700`.
- [ ] Scroll areas: `flex-1 min-h-0 overflow-y-auto` + `custom-scrollbar` if needed.

---

## Files reference

| File                         | Role                                                     |
| ---------------------------- | -------------------------------------------------------- |
| `uiStyles.ts`                | Tokens: `card`, `input`, `sectionTitle`, chips, buttons  |
| `components/PageWrapper.tsx` | Header + main + safe area + bottom padding for nav       |
| `global.css`                 | Fluid `html` font-size, viewport height, `#main-content` |
| `App.tsx`                    | Bottom nav `id="dg-bottom-nav"`, phase router            |
| `CommunicationDashboard.tsx` | Heavier `uiStyles` usage — good reference                |

_Last reviewed: automated pass + targeted nav/toggle tweaks._
