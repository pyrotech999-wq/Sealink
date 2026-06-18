'use client';

import { useIsMobileApp } from '@/hooks/useIsMobileApp';
import ForSaleDesktop from './ForSaleDesktop';
import ForSaleMobile from './ForSaleMobile';

export default function ForSaleView() {
  const { mounted, isMobile } = useIsMobileApp();

  if (!mounted) {
    return null;
  }

  return isMobile ? (
    <ForSaleMobile />
  ) : (
    <ForSaleDesktop />
  );
}