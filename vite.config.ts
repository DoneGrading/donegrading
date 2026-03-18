/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: './postcss.config.js',
  },
  test: {
    // Run unit tests only. e2e specs use Playwright.
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/lib/**', '**/e2e/**'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          lucide: ['lucide-react'],
          gemini: ['@google/genai'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
  },
});
