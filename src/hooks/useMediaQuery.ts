import { useEffect, useState } from 'react';

/**
 * Reactive viewport query with a deterministic fallback when matchMedia is
 * unavailable (server rendering, jsdom). Used to collapse the toolbar's format
 * group into an overflow menu and to switch labels on/off at one breakpoint
 * instead of six scattered Tailwind prefixes that thrash independently.
 */
export function useMediaQuery(query: string, fallback = true): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') {
      return fallback;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
