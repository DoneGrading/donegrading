const ONBOARDING_KEY = 'dg_onboarding_done_v1';

export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    // ignore
  }
}
