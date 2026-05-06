"use client";

import Link from "next/link";
import { OpcChartsBox } from "@/components/weather/OpcChartsBox";
import { WeatherCombinedMap } from "@/components/weather/WeatherCombinedMap";
import { WeatherchartsUkMedEuropePressureBox } from "@/components/weather/WeatherchartsUkMedEuropePressureBox";

export function WeatherMapClientWrapper() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Weather</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Interactive map and official chart images (cached up to 6 hours).
          </p>
        </div>
        <Link
          href="/navigation-charts"
          className="inline-flex h-10 min-h-10 w-full shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:mt-0 sm:w-auto"
        >
          Navigation Charts
        </Link>
      </div>

      <WeatherchartsUkMedEuropePressureBox />
      <WeatherCombinedMap />
      <OpcChartsBox />
    </div>
  );
}

