import { useEffect, useState } from 'react';

/**
 * True on touch-primary devices (phones/tablets), false on mouse/trackpad.
 * Used to switch interactions like double-click-to-open to single-tap,
 * since double-tap isn't a discoverable mobile gesture.
 */
export function useIsCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');
    setIsCoarse(mql.matches);

    const handler = (e: MediaQueryListEvent) => setIsCoarse(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isCoarse;
}
