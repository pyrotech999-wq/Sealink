"use client";

import { useState } from "react";
import { FaxChartsMode } from "@/components/weather/FaxChartsMode";
import { WeatherModelChartViewer } from "@/components/weather/WeatherModelChartViewer";

export function WeatherMapClientWrapper() {
  const [mode, setMode] = useState<"fax" | "interactive">("fax");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Weather</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Fax charts and an interactive model map (no external iframes).
        </p>
      </div>

      <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <button
          type="button"
          onClick={() => setMode("fax")}
          className={`h-9 px-3 text-xs font-semibold ${
            mode === "fax"
              ? "bg-emerald-600 text-white"
              : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
          }`}
        >
          Fax Charts
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
          Interactive Map
        </button>
      </div>

      {mode === "fax" ? <FaxChartsMode /> : <WeatherModelChartViewer />}
    </div>
  );
}

