"use client";

import { WeatherModelChartViewer } from "@/components/weather/WeatherModelChartViewer";
import { OpcChartsBox } from "@/components/weather/OpcChartsBox";

export function WeatherMapClientWrapper() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Weather</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Self-hosted forecast map layers built from Open-Meteo grid data (no external iframes).
        </p>
      </div>
      <OpcChartsBox />
      <WeatherModelChartViewer />
    </div>
  );
}

