"use client";

import { useEffect, useState } from 'react';
import { ReactLenis } from 'lenis/react';

const nativeScrollSelectors = '.custom-scrollbar, .no-scrollbar, .cyber-scrollbar, [data-lenis-prevent]';

export default function SmoothScroll() {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateEnabled = (): void => setEnabled(finePointer.matches && !reducedMotion.matches);
    updateEnabled();
    finePointer.addEventListener('change', updateEnabled);
    reducedMotion.addEventListener('change', updateEnabled);
    return () => {
      finePointer.removeEventListener('change', updateEnabled);
      reducedMotion.removeEventListener('change', updateEnabled);
    };
  }, []);

  if (!enabled) return null;

  return (
    <ReactLenis
      root
      options={{
        autoRaf: true,
        smoothWheel: true,
        lerp: 0.14,
        wheelMultiplier: 1,
        syncTouch: false,
        prevent: (node: HTMLElement): boolean => node.closest(nativeScrollSelectors) !== null,
      }}
    />
  );
}
