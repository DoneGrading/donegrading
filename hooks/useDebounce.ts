import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Debounce a value. After `delayMs` of no changes, the returned value updates.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

/**
 * Return a debounced callback. The callback is invoked after `delayMs` of no further invocations.
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastArgsRef = useRef<Parameters<T> | null>(null);

  const debounced = useCallback(
    ((...args: Parameters<T>) => {
      lastArgsRef.current = args;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        const last = lastArgsRef.current;
        if (last) fn(...last);
      }, delayMs);
    }) as T,
    [fn, delayMs]
  );

  return debounced;
}
