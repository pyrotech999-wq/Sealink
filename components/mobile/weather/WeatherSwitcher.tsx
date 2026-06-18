"use client";

import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import MobileWeather from "./MobileWeather";

interface WeatherSwitcherProps {
  children: React.ReactNode;
}

export default function WeatherSwitcher({
  children,
}: WeatherSwitcherProps) {
  const { isMobile, mounted } = useIsMobileApp();

  if (!mounted) {
    return <>{children}</>;
  }

  return isMobile ? <MobileWeather /> : <>{children}</>;
}