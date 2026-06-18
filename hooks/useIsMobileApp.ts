// @/hooks/useIsMobileApp.ts
'use client';

import { useEffect, useState } from 'react';

export function useIsMobileApp() {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMounted(true);

    const checkDevice = () => {
      const isCapacitor =
        typeof (window as any).Capacitor?.isNativePlatform === 'function'
          ? (window as any).Capacitor.isNativePlatform()
          : false;

      const isSmallScreen = window.matchMedia('(max-width: 768px)').matches;

      setIsMobile(isCapacitor || isSmallScreen);
    };

    checkDevice();

    window.addEventListener('resize', checkDevice);

    return () => {
      window.removeEventListener('resize', checkDevice);
    };
  }, []);

  return {
    mounted,
    isMobile,
  };
}
