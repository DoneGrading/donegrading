export type AnalyticsEvent =
  | 'auth_google_sign_in'
  | 'auth_email_sign_in'
  | 'auth_email_sign_up'
  | 'course_select'
  | 'sync_start'
  | 'sync_success'
  | 'sync_error'
  | 'sync_email_success'
  | 'sync_email_error'
  | 'page_view'
  | 'grading_session_start'
  | 'scan_capture'
  | 'rubric_created'
  | 'lesson_generated'
  | 'message_sent'
  | 'paywall_view'
  | 'subscription_start';

const CONSENT_KEY = 'dg_analytics_consent';

export function getAnalyticsConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export function setAnalyticsConsent(allowed: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, allowed ? '1' : '0');
  } catch {
    // ignore
  }
}

/**
 * Log event. When consent is false, no-op (or console in dev).
 * Wire to GA4 / Firebase Analytics by replacing the body:
 * e.g. gtag('event', event, data) or logEvent(analytics, event, data).
 */
export function logEvent(event: AnalyticsEvent, data: Record<string, unknown> = {}): void {
  if (!getAnalyticsConsent()) {
    if ((import.meta as any).env?.DEV) console.info('[Analytics] (consent off)', event, data);
    return;
  }
  // Replace with real provider:
  // if (typeof gtag !== 'undefined') gtag('event', event, data);
  console.info('[Analytics]', event, data);
}
