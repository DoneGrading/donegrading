/**
 * Persisted auth session: keeps user signed in for up to one week of inactivity.
 */

const AUTH_SESSION_KEY = 'dg_auth_session_v1';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type AuthSession = {
  accessToken: string;
  educatorName: string;
  lastActivityAt: number;
};

export function saveAuthSession(accessToken: string, educatorName: string): void {
  if (typeof window === 'undefined') return;
  const session: AuthSession = {
    accessToken,
    educatorName,
    lastActivityAt: Date.now(),
  };
  try {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('Could not save auth session', e);
  }
}

export function loadAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    if (!session?.accessToken || !session?.lastActivityAt) return null;
    const elapsed = Date.now() - session.lastActivityAt;
    if (elapsed > ONE_WEEK_MS) {
      localStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearAuthSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // ignore
  }
}

/** Update lastActivityAt for an existing session to extend the 7‑day window. */
export function touchAuthSession(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return;
    const session = JSON.parse(raw) as AuthSession;
    if (!session?.accessToken) return;
    session.lastActivityAt = Date.now();
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}
