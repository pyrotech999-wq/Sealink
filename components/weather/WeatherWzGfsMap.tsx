"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  guessLatestGfsRunUtc,
  WZ_GFS_MAP_MAX_H_3D,
  WZ_GFS_MAP_REGIONS,
  WZ_GFS_MAP_STEP_H,
  type GfsRunHour,
  type WzGfsMapParam,
  type WzGfsMapRegionCode,
} from "@/lib/wetterzentrale-gfs-map-image";

const RUNS: GfsRunHour[] = [0, 6, 12, 18];

const PARAM_TABS: { id: WzGfsMapParam; label: string }[] = [
  { id: "wind10m", label: "10 m wind" },
  { id: "temp2m", label: "2 m temperature" },
  { id: "precip1h", label: "1 h precipitation" },
];

function mapApiUrl(region: WzGfsMapRegionCode, run: GfsRunHour, leadHours: number, param: WzGfsMapParam): string {
  const qs = new URLSearchParams({
    region,
    run: String(run),
    time: String(leadHours),
    param,
  });
  return `/api/weather/wz-gfs-map?${qs.toString()}`;
}

export function WeatherWzGfsMap() {
  const [region, setRegion] = useState<WzGfsMapRegionCode>("EU");
  const [run, setRun] = useState<GfsRunHour>(() => guessLatestGfsRunUtc());
  const [param, setParam] = useState<WzGfsMapParam>("wind10m");
  const [leadHours, setLeadHours] = useState(0);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
  const [imgNonce, setImgNonce] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; px: number; py: number } | null>(null);

  const regionMeta = useMemo(() => WZ_GFS_MAP_REGIONS.find((r) => r.code === region), [region]);
  const windOk = regionMeta?.supports10mWind !== false;

  const effectiveParam: WzGfsMapParam = param === "wind10m" && !windOk ? "temp2m" : param;

  const imageUrl = useMemo(
    () => mapApiUrl(region, run, leadHours, effectiveParam),
    [region, run, leadHours, effectiveParam],
  );

  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [region, run, leadHours, effectiveParam]);

  useEffect(() => {
    if (scale <= 1) setPan({ x: 0, y: 0 });
  }, [scale]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => Math.min(5, Math.max(1, s + -e.deltaY * 0.002)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const step = (delta: number) => {
    setLeadHours((h) => {
      const n = h + delta * WZ_GFS_MAP_STEP_H;
      return Math.max(0, Math.min(WZ_GFS_MAP_MAX_H_3D, n));
    });
  };

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d?.active) return;
    setPan({
      x: d.px + (e.clientX - d.sx),
      y: d.py + (e.clientY - d.sy),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current?.active) {
      dragRef.current.active = false;
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  const leadLabel = leadHours === 0 ? "Analysis / +0 h" : `+${leadHours} h`;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">GFS maps (Wetterzentrale)</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          Operational GFS charts for the domains used on{" "}
          <a
            href="https://www.wetterzentrale.de/en/topkarten.php?map=1&model=gfs"
            className="font-medium text-emerald-700 underline dark:text-emerald-400"
            target="_blank"
            rel="noreferrer"
          >
            Wetterzentrale Top Karten
          </a>
          . Same image is requested for up to six hours from our cache. Guidance only—check official forecasts and
          warnings.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PARAM_TABS.map(({ id, label }) => {
          const disabled = id === "wind10m" && !windOk;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              title={disabled ? "10 m wind is not available for Northern / Southern Hemisphere on this product." : undefined}
              onClick={() => setParam(id)}
              className={`h-9 rounded-lg px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                effectiveParam === id
                  ? "bg-emerald-600 text-white"
                  : "border border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {!windOk && param === "wind10m" ? (
        <p className="text-[11px] text-amber-800 dark:text-amber-200">
          10 m wind is not published for {regionMeta?.label ?? region} on Wetterzentrale; showing 2 m temperature
          instead.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Area</span>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value as WzGfsMapRegionCode)}
          className="h-10 w-full max-w-md rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:ml-auto"
        >
          {WZ_GFS_MAP_REGIONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
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
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            }`}
          >
            {String(r).padStart(2, "0")}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Forecast step</span>
        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {leadLabel} · 3-hour steps · 0–72 h (3 days)
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={leadHours <= 0}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-semibold disabled:opacity-40 dark:border-zinc-700"
          >
            −3 h
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={leadHours >= WZ_GFS_MAP_MAX_H_3D}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-semibold disabled:opacity-40 dark:border-zinc-700"
          >
            +3 h
          </button>
          <button
            type="button"
            onClick={resetView}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-semibold dark:border-zinc-700"
          >
            Reset zoom
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative isolate h-[min(70vh,560px)] w-full cursor-grab overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 active:cursor-grabbing dark:border-zinc-800"
      >
        {loadState === "loading" ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/40 text-xs font-medium text-white">
            Loading map…
          </div>
        ) : null}
        {loadState === "error" ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950 p-4 text-center text-xs text-zinc-200">
            <p>Could not load this chart (run may not be ready yet, or the upstream map is missing).</p>
            <button
              type="button"
              onClick={() => {
                setLoadState("loading");
                setImgNonce((n) => n + 1);
              }}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Retry
            </button>
          </div>
        ) : null}

        <div
          role="presentation"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="flex h-full w-full touch-none items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- proxied PNG from our API */}
          <img
            key={`${imageUrl}-${imgNonce}`}
            src={imageUrl}
            alt={`GFS ${effectiveParam} ${region} ${run}Z ${leadLabel}`}
            className="max-h-full max-w-full select-none object-contain"
            draggable={false}
            onLoad={() => setLoadState("idle")}
            onError={() => setLoadState("error")}
            onLoadStart={() => setLoadState("loading")}
          />
        </div>

        <p className="pointer-events-none absolute bottom-2 left-2 right-2 text-center text-[10px] text-zinc-400">
          Scroll to zoom · drag to pan when zoomed · maps © Wetterzentrale
        </p>
      </div>
    </section>
  );
}
