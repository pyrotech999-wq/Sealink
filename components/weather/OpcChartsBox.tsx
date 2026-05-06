"use client";

import { useCallback, useMemo, useState } from "react";
import {
  OPC_REGIONS,
  OPC_TIMELINES,
  getOpcFamily,
  getOpcRegion,
  type OpcChartFamilyId,
  type OpcRegionId,
  type OpcTimelineKey,
} from "@/lib/weather/opc-products";

const FORECAST_KEYS: OpcTimelineKey[] = ["24h", "48h", "72h", "96h"];

function clampIdx(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function OpcChartsBox() {
  const [regionId, setRegionId] = useState<OpcRegionId>("atlantic");
  const region = useMemo(() => getOpcRegion(regionId), [regionId]);

  const [familyId, setFamilyId] = useState<OpcChartFamilyId>("surface");
  const family = useMemo(() => getOpcFamily(region, familyId), [region, familyId]);

  const initialTimeline: OpcTimelineKey = useMemo(() => {
    return family.productsByTimeline["24h"] ? "24h" : family.productsByTimeline.analysis ? "analysis" : "48h";
  }, [family.productsByTimeline]);

  const [timeline, setTimeline] = useState<OpcTimelineKey>(initialTimeline);

  // Keep timeline valid when region/family changes.
  const effectiveTimeline = useMemo<OpcTimelineKey>(() => {
    if (family.productsByTimeline[timeline]) return timeline;
    if (family.productsByTimeline["24h"]) return "24h";
    if (family.productsByTimeline.analysis) return "analysis";
    const first = (OPC_TIMELINES.map((t) => t.key).find((k) => family.productsByTimeline[k]) ?? "24h") as OpcTimelineKey;
    return first;
  }, [family.productsByTimeline, timeline]);

  const product = family.productsByTimeline[effectiveTimeline] ?? null;

  const imgSrc = useMemo(() => {
    if (!product) return null;
    const qs = new URLSearchParams({ category: region.opcCategory, product });
    return `/api/weather/opc-chart?${qs.toString()}`;
  }, [product, region.opcCategory]);

  const forecastIdx = useMemo(() => {
    const idx = FORECAST_KEYS.indexOf(effectiveTimeline);
    return idx >= 0 ? idx : 0;
  }, [effectiveTimeline]);

  const canStepForecast = useMemo(() => {
    return FORECAST_KEYS.some((k) => family.productsByTimeline[k]);
  }, [family.productsByTimeline]);

  const stepForecast = useCallback(
    (dir: -1 | 1) => {
      if (!canStepForecast) return;
      const available = FORECAST_KEYS.filter((k) => !!family.productsByTimeline[k]);
      if (!available.length) return;
      const cur = available.includes(effectiveTimeline) ? effectiveTimeline : available[0]!;
      const idx = available.indexOf(cur);
      const next = available[clampIdx(idx + dir, 0, available.length - 1)]!;
      setTimeline(next);
    },
    [canStepForecast, effectiveTimeline, family.productsByTimeline],
  );

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Ocean Prediction Centre charts</h2>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            Atlantic, Pacific, and Alaska/Arctic charts pulled from OPC and cached for 6 hours.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="inline-flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Region</div>
          <select
            value={regionId}
            onChange={(e) => {
              const next = e.target.value as OpcRegionId;
              setRegionId(next);
              const nextRegion = getOpcRegion(next);
              const stillHasFamily = nextRegion.families.some((f) => f.id === familyId);
              if (!stillHasFamily) setFamilyId(nextRegion.families[0]!.id);
            }}
            className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700"
          >
            {OPC_REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="inline-flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Chart</div>
          <select
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value as OpcChartFamilyId)}
            className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700"
          >
            {region.families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          <button
            type="button"
            disabled={!canStepForecast || forecastIdx <= 0}
            onClick={() => stepForecast(-1)}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            title="Previous forecast period"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={!canStepForecast || forecastIdx >= FORECAST_KEYS.length - 1}
            onClick={() => stepForecast(1)}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            title="Next forecast period"
          >
            Next
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">
          <div className="min-w-0">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{region.label}</span>
            <span className="text-zinc-500 dark:text-zinc-400"> · </span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{family.label}</span>
            <span className="text-zinc-500 dark:text-zinc-400"> · </span>
            <span className="font-mono text-zinc-700 dark:text-zinc-300">{effectiveTimeline}</span>
          </div>
          <a
            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            href="https://ocean.weather.gov/Loops/index.php"
            target="_blank"
            rel="noreferrer"
          >
            OPC site
          </a>
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

