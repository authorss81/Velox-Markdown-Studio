import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 *
 * Used to keep the *editor* instant while making the *expensive derived work*
 * debounced. Markdown parsing plus a full innerHTML replacement is far too costly
 * to run on every keystroke, but the text the user is typing must not lag, so the
 * delay is applied only to the value that feeds the parser.
 */
export function useDebouncedValue<T>(value: T, delayMs = 180): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    // An empty timer on every keystroke is what makes this a debounce rather
    // than a throttle: only the last value in a burst survives.
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
