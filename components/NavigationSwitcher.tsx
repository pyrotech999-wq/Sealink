"use client";

import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import { TopNav } from "@/components/TopNav";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";

export default function NavigationSwitcher() {
  const { isMobile, mounted } = useIsMobileApp();

  if (!mounted) {
    return null;
  }

  return isMobile ? <MobileBottomNav /> : <TopNav />;
}