"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FAX_CHART_TYPES,
  chartTypesForSource,
  getRegion,
  regionsForSource,
  availableHours,
  type FaxChartTypeId,
  type FaxRegionId,
  type FaxSourceId,
} from "@/lib/weather/fax-charts";

type InfoOk = {
  ok: true;
  source: FaxSourceId;
  region: FaxRegionId;
  chartType: FaxChartTypeId;
  forecastHour: number;
  issueTime: string;
  validTime: string;
  issueStamp: string;
  imagePath: string;
};

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function formatDt(s: string): string {
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return s;
  return d.toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
}

function ZoomPanImage({ src, alt }: { src: string; alt: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ on: boolean; x: number; y: number; ox: number; oy: number }>({ on: false, x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    // reset when src changes
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, [src]);

  return (
    <div
      ref={hostRef}
      className="relative h-[min(70vh,620px)] w-full overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900"
      onWheel={(e) => {
        e.preventDefault();
        const delta = -e.deltaY;
        const next = clamp(scale * (delta > 0 ? 1.08 : 0.92), 1, 4);
        setScale(next);
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        dragRef.current = { on: true, x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
      }}
      onMouseMove={(e) => {
        if (!dragRef.current.on) return;
        const dx = e.clientX - dragRef.current.x;
        const dy = e.clientY - dragRef.current.y;
        setPos({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy });
      }}
      onMouseUp={() => (dragRef.current.on = false)}
      onMouseLeave={() => (dragRef.current.on = false)}
      onDoubleClick={() => {
        setScale(1);
        setPos({ x: 0, y: 0 });
      }}
      style={{ touchAction: "none" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="absolute left-1/2 top-1/2 max-w-none select-none"
        draggable={false}
        style={{
          transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${scale})`,
          transformOrigin: "center",
          cursor: scale > 1 ? "grab" : "default",
        }}
      />

      <div className="pointer-events-none absolute bottom-2 right-2 rounded-lg bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">
        Wheel to zoom · Drag to pan · Double-click to reset
      </div>
    </div>
  );
}

export function FaxChartsMode() {
  const [source, setSource] = useState<FaxSourceId>("opc");
  const [regionId, setRegionId] = useState<FaxRegionId>("opc_atlantic");
  const [chartType, setChartType] = useState<FaxChartTypeId>("wind_wave");
  const [forecastHour, setForecastHour] = useState(24);
  const [info, setInfo] = useState<InfoOk | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const regions = useMemo(() => regionsForSource(source), [source]);
  const validRegion = useMemo(() => regions.some((r) => r.id === regionId), [regions, regionId]);
  const region = useMemo(() => (validRegion ? getRegion(regionId) : regions[0]!), [validRegion, regionId, regions]);

  const chartTypeOptions = useMemo(() => chartTypesForSource(source), [source]);
  const validChartType = useMemo(() => chartTypeOptions.includes(chartType), [chartTypeOptions, chartType]);
  const activeChartType = useMemo(() => (validChartType ? chartType : chartTypeOptions[0]!), [validChartType, chartType, chartTypeOptions]);

  const hours = useMemo(() => availableHours(source, activeChartType), [source, activeChartType]);
  const hour = useMemo(() => (hours.includes(forecastHour) ? forecastHour : hours.includes(24) ? 24 : hours[0]!), [forecastHour, hours]);

  useEffect(() => {
    if (!validRegion) setRegionId(region.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    if (!validChartType) setChartType(activeChartType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    if (!hours.includes(forecastHour)) setForecastHour(hour);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, activeChartType]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    setInfo(null);

    (async () => {
      try {
        const qs = new URLSearchParams({
          source,
          region: region.id,
          chartType: activeChartType,
          forecastHour: String(hour),
        });
        const r = await fetch(`/api/weather/fax-chart/info?${qs.toString()}`, { cache: "no-store", signal: ac.signal });
        const j = (await r.json()) as InfoOk | { ok?: false; error?: string };
        if (!r.ok || !("ok" in j) || !j.ok) throw new Error((j as { error?: string }).error || "Failed to load chart");
        setInfo(j as InfoOk);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(e instanceof Error ? e.message : "Failed to load chart");
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [source, region.id, activeChartType, hour]);

  const hourIdx = Math.max(0, hours.indexOf(hour));
  const canBack = hourIdx > 0;
  const canNext = hourIdx < hours.length - 1;

  const chartTypeLabel = FAX_CHART_TYPES.find((t) => t.id === activeChartType)?.label ?? activeChartType;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Fax Charts</h2>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          Official marine fax-style charts (no Open‑Meteo rendering). Images cached server-side for 6 hours per issue time.
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="inline-flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Source</div>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as FaxSourceId)}
            className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700"
          >
            <option value="opc">NOAA OPC</option>
            <option value="dwd">DWD</option>
          </select>
        </div>

        <div className="inline-flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Region</div>
          <select
            value={region.id}
            onChange={(e) => setRegionId(e.target.value as FaxRegionId)}
            className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700"
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="inline-flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Chart</div>
          <select
            value={activeChartType}
            onChange={(e) => setChartType(e.target.value as FaxChartTypeId)}
            className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700"
          >
            {chartTypeOptions.map((id) => (
              <option key={id} value={id}>
                {FAX_CHART_TYPES.find((t) => t.id === id)?.label ?? id}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Forecast <span className="font-mono text-zinc-900 dark:text-zinc-100">+{hour}h</span>
          </div>
          <button
            type="button"
            disabled={!canBack}
            onClick={() => setForecastHour(hours[clamp(hourIdx - 1, 0, hours.length - 1)]!)}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Back
          </button>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => setForecastHour(hours[clamp(hourIdx + 1, 0, hours.length - 1)]!)}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Next
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="flex flex-col gap-1 text-xs text-zinc-700 dark:text-zinc-200">
          <div className="font-semibold">{region.label} · {chartTypeLabel}</div>
          {info ? (
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Issue: <span className="font-mono">{formatDt(info.issueTime)}</span> · Valid:{" "}
              <span className="font-mono">{formatDt(info.validTime)}</span>
            </div>
          ) : null}
        </div>
      </div>

      {err ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
          {err}
        </p>
      ) : null}

      <div className="mt-3">
        {loading ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            Loading chart…
          </div>
        ) : info?.imagePath ? (
          <ZoomPanImage src={info.imagePath} alt={`${region.label} ${chartTypeLabel} +${hour}h`} />
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            No chart selected.
          </div>
        )}
      </div>
    </section>
  );
}

