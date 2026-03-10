/**
 * Sentry initialization and capture. Set VITE_SENTRY_DSN to enable.
 * Scrubs PII in beforeSend.
 */
let sentryInitialized = false;

export function initSentry(): void {
  const dsn =
    typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SENTRY_DSN;
  if (!dsn || typeof dsn !== 'string' || !dsn.startsWith('https://')) return;

  import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: (import.meta as any).env?.MODE || 'development',
      integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration({ maskAllText: true })],
      tracesSampleRate: 0.2,
      replaysOnErrorSampleRate: 0.5,
      beforeSend(event, hint) {
        const msg = event.message || String(hint.originalException || '');
        const sanitized = msg
          .replace(/Bearer\s+[A-Za-z0-9_-]+/gi, 'Bearer [REDACTED]')
          .replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]')
          .replace(/\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g, '[NAME]');
        if (event.message) event.message = sanitized;
        if (event.extra && typeof event.extra === 'object') {
          event.extra = Object.fromEntries(
            Object.entries(event.extra).map(([k, v]) => [
              k,
              typeof v === 'string' ? v.replace(/Bearer\s+[A-Za-z0-9_-]+/gi, '[REDACTED]') : v,
            ])
          );
        }
        return event;
      },
    });
    sentryInitialized = true;
  });
}

export function captureException(error: unknown, extra?: { componentStack?: string }): void {
  if (!sentryInitialized) return;
  import('@sentry/react').then((Sentry) => {
    Sentry.captureException(error, { extra });
  });
}
