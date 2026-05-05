"use client";

import { useMemo, useState } from "react";
import {
  buildWetterzentraleChartUrl,
  chartKindMeta,
  FLOODWARN_CHART_HUB_URL,
  guessLatestGfsRunUtc,
  snapForecastHours,
  WZ_FORECAST_STEP_H,
  WZ_MAX_FORECAST_H_5D,
  type GfsRunHour,
  type WzChartKind,
  type WzRegion,
} from "@/lib/wetterzentrale-gfs-charts";

const RUNS: GfsRunHour[] = [0, 6, 12, 18];

const CHART_TABS: { kind: WzChartKind; short: string }[] = [
  { kind: "pressure", short: "Pressure" },
  { kind: "precipitation", short: "Precipitation" },
  { kind: "wind", short: "Wind" },
  { kind: "waves", short: "Waves" },
];

export function WeatherGfsCharts() {
  const [kind, setKind] = useState<WzChartKind>("wind");
  const [region, setRegion] = useState<WzRegion>("global");
  const [run, setRun] = useState<GfsRunHour>(() => guessLatestGfsRunUtc());
  const [forecastHours, setForecastHours] = useState(0);

  const meta = chartKindMeta(kind);

  const chartUrl = useMemo(
    () =>
      buildWetterzentraleChartUrl({
        kind,
        region,
        run,
        forecastHours: snapForecastHours(forecastHours),
      }),
    [kind, region, run, forecastHours],
  );

  const hourLabel = `+${snapForecastHours(forecastHours)} h`;

  return (
    <section className="mt-8 flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Synoptic charts (GFS)</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          Forecast maps from{" "}
          <a href="https://www.wetter-zentrale.de/en/topkarten.php?lid=OP&model=gfs" className="font-medium text-green-700 underline dark:text-green-400">
            Wetterzentrale
          </a>{" "}
          in the same style as{" "}
          <a href={FLOODWARN_CHART_HUB_URL} className="font-medium text-green-700 underline dark:text-green-400">
            FloodWarn’s chart hub
          </a>
          . Charts are guidance only—compare runs and official warnings. Lead times are limited to the next{" "}
          <strong>5 days</strong> (6-hour steps).
        </p>
        {meta.note ? <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">{meta.note}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {CHART_TABS.map(({ kind: k, short }) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`h-9 rounded-lg px-3 text-xs font-semibold ${
              kind === k
                ? "bg-emerald-600 text-white"
                : "border border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {short}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{meta.label}</span>
        {" · "}
        {region === "global" ? "Global" : "Europe"} domain
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Region</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
          {(
            [
              ["global", "Global"],
              ["europe", "Europe"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRegion(key)}
              className={`h-9 px-3 text-xs font-semibold ${
                region === key ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-white text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Run (UTC)</span>
        {RUNS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRun(r)}
            className={`h-9 min-w-[3rem] rounded-lg text-xs font-semibold ${
              run === r
                ? "bg-emerald-600 text-white"
                : "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {String(r).padStart(2, "0")}Z
          </button>
        ))}
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Forecast lead: {hourLabel}{" "}
          <span className="font-normal text-zinc-500">(6-hour steps, 0–{WZ_MAX_FORECAST_H_5D} h)</span>
          <input
            type="range"
            min={0}
            max={WZ_MAX_FORECAST_H_5D}
            step={WZ_FORECAST_STEP_H}
            value={snapForecastHours(forecastHours)}
            onChange={(e) => setForecastHours(Number(e.target.value))}
            className="mt-2 block w-full accent-emerald-600"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={chartUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center rounded-lg bg-green-600 px-3 text-xs font-semibold text-white hover:bg-green-700"
        >
          Open chart in new tab
        </a>
        <a
          href={FLOODWARN_CHART_HUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          FloodWarn chart hub
        </a>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
        <iframe title={`${meta.label} — Wetterzentrale`} src={chartUrl} className="h-[min(72vh,720px)] w-full border-0 bg-white dark:bg-zinc-950" loading="lazy" />
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        If the frame stays blank, your browser may block embedding—use <strong>Open chart in new tab</strong>.
      </p>
    </section>
  );
}
