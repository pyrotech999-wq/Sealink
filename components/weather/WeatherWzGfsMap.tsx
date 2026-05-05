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

const PARAM_TABS: { id: WzGfsMapParam; label: string; description: string }[] = [
  { id: "wind10m", label: "10 m wind", description: "Near-surface wind (kt). (WZ var=9)" },
  { id: "temp2m", label: "2 m temperature", description: "Air temperature at 2 metres (°C). (WZ var=5)" },
  { id: "precip1h", label: "Precipitation (1 h)", description: "1-hour precipitation (mm). (WZ var=4)" },
];

function rangeHours(max: number, step: number) {
  const out: number[] = [];
  for (let h = 0; h <= max; h += step) out.push(h);
  return out;
}

function closestHour(hours: number[], target: number) {
  if (!hours.length) return target;
  let best = hours[0];
  let bestDist = Math.abs(best - target);
  for (const h of hours) {
    const d = Math.abs(h - target);
    if (d < bestDist) {
      best = h;
      bestDist = d;
    }
  }
  return best;
}

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
  const hours = useMemo(() => rangeHours(WZ_GFS_MAP_MAX_H_3D, WZ_GFS_MAP_STEP_H), []);
  const [leadHours, setLeadHours] = useState(() => hours[0] ?? 0);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
  const [imgNonce, setImgNonce] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; px: number; py: number } | null>(null);

  const regionMeta = useMemo(() => WZ_GFS_MAP_REGIONS.find((r) => r.code === region), [region]);
  const windOk = regionMeta?.supports10mWind !== false;

  const effectiveParam: WzGfsMapParam = param === "wind10m" && !windOk ? "temp2m" : param;
  const activeParamMeta = useMemo(
    () => PARAM_TABS.find((p) => p.id === effectiveParam) ?? PARAM_TABS[0],
    [effectiveParam],
  );

  const imageUrl = useMemo(
    () => mapApiUrl(region, run, leadHours, effectiveParam),
    [region, run, leadHours, effectiveParam],
  );

  const proxied = useMemo(() => `${imageUrl}&v=${imgNonce}`, [imageUrl, imgNonce]);

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

  const step = useCallback(
    (delta: number) => {
      setLeadHours((h) => closestHour(hours, h + delta * WZ_GFS_MAP_STEP_H));
    },
    [hours],
  );

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

  const leadLabel = leadHours === 0 ? "+0 h" : `+${leadHours} h`;
  const leadIndex = Math.max(0, hours.indexOf(leadHours));

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">GFS maps (Wetterzentrale)</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          GFS OP charts matching{" "}
          <a
            href="https://www.wetterzentrale.de/en/topkarten.php?map=1&model=gfs"
            className="font-medium text-emerald-700 underline dark:text-emerald-400"
            target="_blank"
            rel="noreferrer"
          >
            Wetterzentrale Top Karten
          </a>
          . Cached for <strong>6 hours</strong> per selection. Scroll to zoom; drag to pan when zoomed.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PARAM_TABS.map(({ id, label }) => {
          const disabled = id === "wind10m" && !windOk;
          const isActive = id === effectiveParam || (id === "wind10m" && effectiveParam === "temp2m" && param === "wind10m");
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              title={disabled ? "10 m wind is not available for Northern / Southern Hemisphere on this product." : undefined}
              onClick={() => setParam(id)}
              className={
                isActive
                  ? "h-9 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white"
                  : "h-9 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {!windOk && param === "wind10m" ? (
        <p className="text-[11px] text-amber-800 dark:text-amber-200">
          10 m wind is not published for {regionMeta?.label ?? region} on Wetterzentrale; showing 2 m temperature instead.
        </p>
      ) : null}

      <div className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{activeParamMeta.label}</div>
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{activeParamMeta.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
              <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Run</div>
              <select
                value={String(run).padStart(2, "0")}
                onChange={(e) => setRun(Number(e.target.value) as GfsRunHour)}
                className="rounded-lg bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700"
              >
                {RUNS.map((r) => (
                  <option key={r} value={String(r).padStart(2, "0")}>
                    {String(r).padStart(2, "0")}Z
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
              <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Area</div>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value as WzGfsMapRegionCode)}
                className="rounded-lg bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700"
              >
                {WZ_GFS_MAP_REGIONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Forecast hour: <span className="font-mono text-zinc-900 dark:text-zinc-100">{leadLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={leadHours <= (hours[0] ?? 0)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                −3h
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={leadHours >= (hours[hours.length - 1] ?? WZ_GFS_MAP_MAX_H_3D)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                +3h
              </button>
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(1, Math.min(5, s - 0.25)))}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                − zoom
              </button>
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(1, Math.min(5, s + 0.25)))}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                + zoom
              </button>
              <button
                type="button"
                onClick={resetView}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                Reset
              </button>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, hours.length - 1)}
            value={leadIndex}
            onChange={(e) => setLeadHours(hours[Number(e.target.value)] ?? 0)}
            className="mt-3 w-full"
          />
          <div className="mt-2 flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="font-mono">+{hours[0] ?? 0}h</span>
            <span className="font-mono">+{hours[Math.floor(hours.length / 2)] ?? 0}h</span>
            <span className="font-mono">+{hours[hours.length - 1] ?? WZ_GFS_MAP_MAX_H_3D}h</span>
          </div>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative isolate h-[min(72vh,720px)] w-full cursor-grab overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 active:cursor-grabbing dark:border-zinc-800"
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
            key={`${proxied}`}
            src={proxied}
            alt={`GFS ${effectiveParam} ${region} ${run}Z ${leadLabel}`}
            className="max-h-full max-w-full select-none object-contain"
            draggable={false}
            onLoad={() => setLoadState("idle")}
            onError={() => setLoadState("error")}
            onLoadStart={() => setLoadState("loading")}
            loading="lazy"
          />
        </div>

        <p className="pointer-events-none absolute bottom-2 left-2 right-2 text-center text-[10px] text-zinc-400">
          Maps © Wetterzentrale · 3-hour steps · 0–72h · cached 6h
        </p>
      </div>
    </section>
  );
}
