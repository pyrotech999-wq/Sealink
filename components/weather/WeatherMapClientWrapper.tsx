"use client";

import { WeatherModelChartViewer } from "@/components/weather/WeatherModelChartViewer";
import { OpcChartsBox } from "@/components/weather/OpcChartsBox";
import { OpcSurfacePressureBox } from "@/components/weather/OpcSurfacePressureBox";

export function WeatherMapClientWrapper() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Weather</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Interactive map plus official OPC chart viewers (cached up to 6 hours).
        </p>
      </div>

      <WeatherModelChartViewer />

      <div className="pt-2">
        <OpcSurfacePressureBox />
      </div>
      <OpcChartsBox />
    </div>
  );
}

