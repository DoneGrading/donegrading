/**
 * Safely parse JSON from localStorage or any string. Returns fallback on null, invalid JSON, or throw.
 */
export function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
