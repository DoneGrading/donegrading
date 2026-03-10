/**
 * Design tokens for consistent theming. Use in Tailwind config or inline.
 */
export const tokens = {
  color: {
    primary: {
      50: '#eef2ff',
      500: '#6366f1',
      600: '#4f46e5',
      700: '#4338ca',
    },
    slate: {
      50: '#f8fafc',
      200: '#e2e8f0',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617',
    },
  },
  radius: {
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.75rem',
  },
  spacing: {
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    6: '1.5rem',
  },
} as const;
