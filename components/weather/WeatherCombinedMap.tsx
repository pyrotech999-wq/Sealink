"use client";

import { useState } from "react";
import { WeatherModelChartViewer } from "@/components/weather/WeatherModelChartViewer";
import { OpcSurfacePressureBox } from "@/components/weather/OpcSurfacePressureBox";

export function WeatherCombinedMap() {
  const [mode, setMode] = useState<"surface_pressure" | "interactive">("surface_pressure");

  return (
    <section className="flex flex-col gap-3">
      <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <button
          type="button"
          onClick={() => setMode("surface_pressure")}
          className={`h-9 px-3 text-xs font-semibold ${
            mode === "surface_pressure"
              ? "bg-emerald-600 text-white"
              : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
          }`}
        >
          Surface pressure
        </button>
        <button
          type="button"
          onClick={() => setMode("interactive")}
          className={`h-9 px-3 text-xs font-semibold ${
            mode === "interactive"
              ? "bg-emerald-600 text-white"
              : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
          }`}
        >
          Interactive
        </button>
      </div>

      {mode === "surface_pressure" ? <OpcSurfacePressureBox /> : <WeatherModelChartViewer />}
    </section>
  );
}

