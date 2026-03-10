const REQUIRED_DEV = ['VITE_GEMINI_API_KEY'] as const;

function getEnv(key: string): string | undefined {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.[key]) {
    return (import.meta as any).env[key];
  }
  return undefined;
}

/**
 * In development, warn in console if required env vars are missing.
 * Does not throw; only logs.
 */
export function checkEnv(): void {
  if (typeof window === 'undefined') return;
  const isDev =
    (import.meta as any).env?.DEV === true ||
    (import.meta as any).env?.MODE === 'development' ||
    /localhost|127\.0\.0\.1/.test(window.location?.host || '');
  if (!isDev) return;

  const missing = REQUIRED_DEV.filter((key) => !getEnv(key)?.trim());
  if (missing.length > 0) {
    console.warn(
      '[DoneGrading] Missing recommended env in development:',
      missing.join(', '),
      '— copy .env.example to .env.local and set values.'
    );
  }
}
