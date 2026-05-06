"use client";

import { useMemo, useState } from "react";
import { OPC_TIMELINES, getOpcFamily, getOpcRegion, type OpcRegionId, type OpcTimelineKey } from "@/lib/weather/opc-products";

export function OpcSurfacePressureBox() {
  const [regionId, setRegionId] = useState<OpcRegionId>("atlantic");
  const region = useMemo(() => getOpcRegion(regionId), [regionId]);
  const family = useMemo(() => getOpcFamily(region, "surface"), [region]);

  const [timeline, setTimeline] = useState<OpcTimelineKey>("24h");

  const effectiveTimeline = useMemo<OpcTimelineKey>(() => {
    if (family.productsByTimeline[timeline]) return timeline;
    if (family.productsByTimeline["24h"]) return "24h";
    if (family.productsByTimeline.analysis) return "analysis";
    return "48h";
  }, [family.productsByTimeline, timeline]);

  const product = family.productsByTimeline[effectiveTimeline] ?? null;

  const imgSrc = useMemo(() => {
    if (!product) return null;
    const qs = new URLSearchParams({ category: region.opcCategory, product });
    return `/api/weather/opc-chart?${qs.toString()}`;
  }, [product, region.opcCategory]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Surface pressure maps</h2>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            Ocean Prediction Center (OPC) surface analysis and forecasts. Latest charts refresh every 6 hours (cached for 6
            hours for all users).
          </p>
        </div>
        <a
          className="self-start rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          href="https://ocean.weather.gov/Loops/index.php"
          target="_blank"
          rel="noreferrer"
        >
          OPC site
        </a>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="inline-flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Region</div>
          <select
            value={regionId}
            onChange={(e) => setRegionId(e.target.value as OpcRegionId)}
            className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700"
          >
            <option value="atlantic">Atlantic</option>
            <option value="pacific">Pacific</option>
            <option value="arctic">Alaska / Arctic</option>
          </select>
        </div>

        <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {OPC_TIMELINES.map(({ key, label }) => {
            const enabled = !!family.productsByTimeline[key];
            const active = key === effectiveTimeline;
            return (
              <button
                key={key}
                type="button"
                disabled={!enabled}
                onClick={() => setTimeline(key)}
                className={`h-9 px-3 text-xs font-semibold ${
                  active
                    ? "bg-emerald-600 text-white"
                    : enabled
                      ? "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      : "cursor-not-allowed text-zinc-400 opacity-60 dark:text-zinc-600"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="border-b border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{region.label}</span>
          <span className="text-zinc-500 dark:text-zinc-400"> · </span>
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">Surface pressure</span>
          <span className="text-zinc-500 dark:text-zinc-400"> · </span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">{effectiveTimeline}</span>
        </div>
        <div className="flex items-center justify-center p-2 sm:p-3">
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt=""
              className="h-auto w-full max-w-[980px] rounded-xl bg-white shadow-sm dark:bg-zinc-950"
            />
          ) : (
            <div className="w-full rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              No chart available for this selection.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

