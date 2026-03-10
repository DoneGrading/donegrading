/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './ErrorBoundary.tsx',
    './CommunicationDashboard.tsx',
    './main.tsx',
    './index.tsx',
    './uiStyles.ts',
    './components/**/*.{ts,tsx}',
    './views/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './design/**/*.ts',
    './i18n/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      animation: {
        'gradient-wave': 'gradient-wave 18s ease-in-out infinite',
        'gradient-orbit': 'gradient-orbit 22s linear infinite',
        scan: 'scan 2.5s ease-in-out infinite',
        'share-shimmer': 'share-shimmer 2s ease-in-out infinite',
        'share-rainbow': 'share-rainbow 4s linear infinite',
      },
      keyframes: {
        'share-shimmer': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'share-rainbow': {
          '0%': { filter: 'hue-rotate(0deg)' },
          '100%': { filter: 'hue-rotate(360deg)' },
        },
        'gradient-wave': {
          '0%': { backgroundPosition: '40% 50%' },
          '25%': { backgroundPosition: '55% 60%' },
          '50%': { backgroundPosition: '65% 50%' },
          '75%': { backgroundPosition: '55% 40%' },
          '100%': { backgroundPosition: '40% 50%' },
        },
        'gradient-orbit': {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '50%': { transform: 'rotate(180deg) scale(1.06)' },
          '100%': { transform: 'rotate(360deg) scale(1)' },
        },
        scan: {
          '0%': { top: '5%', opacity: '0.3' },
          '50%': { top: '90%', opacity: '1' },
          '100%': { top: '5%', opacity: '0.3' },
        },
      },
    },
  },
  plugins: [],
};
