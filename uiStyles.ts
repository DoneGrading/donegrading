/**
 * Shared UI design tokens for consistent buttons, cards, inputs, typography, and spacing.
 * Use these across App.tsx and CommunicationDashboard.tsx.
 *
 * Conventions:
 * - Radius: rounded-lg = compact controls, rounded-xl = default cards/inputs, rounded-2xl = large panels
 * - Surfaces: bg-white/85–95 + dark:bg-slate-900/80–90 + border-slate-200 dark:border-slate-700
 * - Primary CTA: indigo-600 / indigo-500 (see btnPrimary + bg-* overrides)
 */

// Cards & panels: one radius, padding, border, background
export const card =
  'rounded-xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/85 p-3 shadow-sm';
export const cardTight =
  'rounded-xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/85 p-2 shadow-sm';
/** Larger dashboard-style panel (matches common App.tsx blocks). */
export const cardLarge =
  'rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/70 dark:bg-slate-800/55 p-4 shadow-sm';

// Section / block titles
export const sectionTitle =
  'text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400';

// Labels above inputs
export const label = 'text-[10px] font-semibold text-slate-600 dark:text-slate-300';

// Inputs & textareas (single line)
export const input =
  'px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[11px] font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400 transition-colors';
export const textarea =
  'w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[11px] text-slate-800 dark:text-slate-100 resize-none custom-scrollbar outline-none focus:border-indigo-400 transition-colors';

// Primary action button (filled)
export const btnPrimary =
  'w-full py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2';
// Secondary / outline button
export const btnSecondary =
  'w-full py-2.5 rounded-xl text-[11px] font-semibold border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2';
// Ghost / text link
export const btnGhost =
  'py-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 underline underline-offset-2';

// Chips / filter toggles (base; add active/inactive colors)
export const chip = 'px-2 py-0.5 rounded-full text-[9px] font-semibold border transition-all';
export const chipActive = 'bg-indigo-500 text-white border-indigo-500';
export const chipInactive =
  'bg-white/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';

// List item / selectable row
export const listItem =
  'w-full text-left px-3 py-2 rounded-xl text-[11px] border shadow-sm transition-all';
export const listItemActive =
  'bg-indigo-50/90 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-600 text-indigo-900 dark:text-indigo-100';
export const listItemInactive =
  'bg-white/90 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:-translate-y-0.5';

// Spacing
export const gap = 'gap-2';
export const spaceY = 'space-y-2';
export const spaceY3 = 'space-y-3';

// Small helper text
export const helperText = 'text-[9px] text-slate-400 dark:text-slate-500';
