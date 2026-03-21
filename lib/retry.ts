export type RetryOptions = {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: 'fixed' | 'exponential';
  retryable?: (error: unknown, attempt: number) => boolean;
};

const defaultRetryable = (error: unknown): boolean => {
  if (error instanceof Response) return error.status >= 500 || error.status === 429;
  if (error instanceof Error && error.name === 'AbortError') return false;
  return true;
};

/**
 * Retry an async function with optional exponential backoff.
 * Retries on 5xx and 429 by default; use retryable to customize.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoff = 'exponential',
    retryable = defaultRetryable,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt === maxAttempts || !retryable(e, attempt)) throw e;
      const wait = backoff === 'exponential' ? delayMs * Math.pow(2, attempt - 1) : delayMs;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError;
}
