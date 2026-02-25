'use client';

import { useSyncExternalStore } from 'react';

/**
 * Returns true when the viewport width is below the given breakpoint.
 * Uses matchMedia for efficient, listener-based updates (no resize polling).
 * Default breakpoint matches Tailwind's `md` (768px).
 */
export function useIsMobile(breakpoint = 768): boolean {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
      mql.addEventListener('change', callback);
      return () => mql.removeEventListener('change', callback);
    },
    () => window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches,
    () => false, // SSR snapshot: assume desktop
  );
}
