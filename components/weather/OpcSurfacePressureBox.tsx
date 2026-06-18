"use client";

import { useMemo, useState } from "react";
import { OPC_TIMELINES, getOpcFamily, getOpcRegion, type OpcRegionId, type OpcTimelineKey } from "@/lib/weather/opc-products";
import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import { ExternalLink } from "lucide-react";

export function OpcSurfacePressureBox() {
  const { isMobile, mounted } = useIsMobileApp();
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

  if (mounted && isMobile) {
    return (
      <div className="space-y-4 text-slate-100">
        {/* Region Selector */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Region</label>
          <select
            value={regionId}
            onChange={(e) => setRegionId(e.target.value as OpcRegionId)}
            className="w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 text-xs font-bold text-slate-200 outline-none focus:border-indigo-500 transition-all"
          >
            <option value="atlantic" className="bg-zinc-950 text-white">Atlantic</option>
            <option value="pacific" className="bg-zinc-950 text-white">Pacific</option>
            <option value="arctic" className="bg-zinc-950 text-white">Alaska / Arctic</option>
          </select>
        </div>

        {/* Timeline selector */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Forecast Period</label>
          <div className="flex gap-1 overflow-x-auto pb-1.5 scrollbar-hide">
            {OPC_TIMELINES.map(({ key, label }) => {
              const enabled = !!family.productsByTimeline[key];
              const active = key === effectiveTimeline;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!enabled}
                  onClick={() => setTimeline(key)}
                  className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all shrink-0 active:scale-95 ${
                    active
                      ? "bg-indigo-600 text-white shadow-md border border-indigo-500/20"
                      : enabled
                        ? "bg-white/[0.03] border border-white/[0.05] text-slate-300 hover:bg-white/[0.06]"
                        : "text-zinc-600 opacity-30 cursor-not-allowed border border-transparent"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart View Container */}
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-black/25 flex flex-col shadow-inner">
          <div className="flex items-center justify-between border-b border-white/[0.05] px-3.5 py-2 text-[10px] text-zinc-400 font-bold bg-[#091220]/45">
            <span className="truncate">{region.label} · Surface Pressure · {effectiveTimeline.toUpperCase()}</span>
            <a
              className="shrink-0 flex items-center gap-1 text-[9px] font-extrabold text-blue-400 bg-blue-500/10 border border-blue-500/25 px-2 py-0.5 rounded-lg active:scale-95 transition-all"
              href="https://ocean.weather.gov/Loops/index.php"
              target="_blank"
              rel="noreferrer"
            >
              <span>OPC Site</span>
              <ExternalLink size={8} />
            </a>
          </div>

          <div className="flex items-center justify-center p-2 bg-zinc-950/20">
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgSrc}
                alt=""
                className="h-auto w-full rounded-xl bg-white shadow-lg border border-white/[0.04]"
              />
            ) : (
              <div className="w-full py-16 text-center text-xs text-zinc-500">
                No chart available for this selection.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

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
