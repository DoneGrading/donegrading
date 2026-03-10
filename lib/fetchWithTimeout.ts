/**
 * Fetch with a timeout. Rejects with a DOMException (AbortError) or a custom error after ms.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 30_000, ...fetchInit } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, {
      ...fetchInit,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}
