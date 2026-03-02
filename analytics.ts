export type AnalyticsEvent =
  | 'auth_google_sign_in'
  | 'auth_demo_login'
  | 'course_select'
  | 'sync_start'
  | 'sync_success'
  | 'sync_error'
  | 'sync_email_success'
  | 'sync_email_error';

// Stubbed analytics: replace console.info with a real analytics service (e.g., Google Analytics, Firebase Analytics)
export function logEvent(event: AnalyticsEvent, data: Record<string, any> = {}): void {
  // eslint-disable-next-line no-console
  console.info('[Analytics]', event, data);
}

