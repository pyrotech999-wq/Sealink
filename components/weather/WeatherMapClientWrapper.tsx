"use client";

import { MetOfficeUkMedEuropePressureBox } from "@/components/weather/MetOfficeUkMedEuropePressureBox";
import { OpcChartsBox } from "@/components/weather/OpcChartsBox";
import { WeatherCombinedMap } from "@/components/weather/WeatherCombinedMap";

export function WeatherMapClientWrapper() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Weather</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Interactive map and official chart images (cached up to 6 hours).
        </p>
      </div>

      <MetOfficeUkMedEuropePressureBox />
      <WeatherCombinedMap />
      <OpcChartsBox />
    </div>
  );
}

