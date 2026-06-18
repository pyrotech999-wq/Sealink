"use client";

import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import { MobileNavigationCharts } from "./MobileNavigationCharts";
import { NavigationChartsClient } from "@/components/navigation-charts/NavigationChartsClient";

export default function ChartsSwitcher() {
  const { isMobile, mounted } = useIsMobileApp();

  if (!mounted) {
    return (
      <div className="flex flex-1 flex-col bg-black min-h-screen">
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-8 sm:px-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-sm h-96 animate-pulse" />
        </main>
      </div>
    );
  }

  if (isMobile) {
    return <MobileNavigationCharts />;
  }

  return <NavigationChartsClient />;
}
