'use client';

import { useIsMobileApp } from '@/hooks/useIsMobileApp';
import { MarinaBookingsClient } from '@/app/marinas/MarinaBookingsClient';
import { MobileMarinas } from '@/components/mobile/marinas/MobileMarinas';

export function MarinasSwitcher() {
  const { isMobile, mounted } = useIsMobileApp();

  // Before mount, default to desktop layout to avoid layout shift on web.
  if (!mounted) return <MarinaBookingsClient />;

  if (isMobile) return <MobileMarinas />;
  return <MarinaBookingsClient />;
}
