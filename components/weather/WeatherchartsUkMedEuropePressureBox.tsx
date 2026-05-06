"use client";

import { useMemo, useState } from "react";

const TIMELINES: { key: string; label: string }[] = [
  { key: "analysis", label: "Analysis" },
  { key: "24", label: "T+24" },
  { key: "36", label: "T+36" },
  { key: "48", label: "T+48" },
  { key: "60", label: "T+60" },
  { key: "72", label: "T+72" },
  { key: "84", label: "T+84" },
  { key: "96", label: "T+96" },
  { key: "120", label: "T+120" },
];

export function WeatherchartsUkMedEuropePressureBox() {
  const [timeline, setTimeline] = useState<string>("analysis");

  const imgSrc = useMemo(() => {
    const qs = new URLSearchParams({ hour: timeline });
    return `/api/weather/weathercharts/ukmo-mslp?${qs.toString()}`;
  }, [timeline]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            UK, Med &amp; Europe — surface pressure
          </h2>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            UKMO MSLP analysis + prognosis via weathercharts.org (cached for 6 hours for all users).
          </p>
        </div>
        <a
          className="self-start rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          href="https://www.weathercharts.org/ukmomslp.htm"
          target="_blank"
          rel="noreferrer"
        >
          Source
        </a>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="inline-flex max-w-full overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {TIMELINES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTimeline(key)}
              className={`h-9 shrink-0 px-3 text-xs font-semibold ${
                key === timeline
                  ? "bg-emerald-600 text-white"
                  : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="border-b border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">UK, Med &amp; Europe</span>
          <span className="text-zinc-500 dark:text-zinc-400"> · </span>
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">MSLP</span>
          <span className="text-zinc-500 dark:text-zinc-400"> · </span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">{timeline}</span>
        </div>
        <div className="flex items-center justify-center p-2 sm:p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt=""
            className="h-auto w-full max-w-[980px] rounded-xl bg-white shadow-sm dark:bg-zinc-950"
          />
        </div>
      </div>
    </section>
  );
}

