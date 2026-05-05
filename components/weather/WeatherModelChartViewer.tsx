"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WEATHER_CHART_REGIONS, type WeatherChartRegionId } from "@/lib/weather/model-chart-regions";

type LayerId = "wind10m" | "pressure_msl" | "precipitation" | "temperature_2m";

const LAYERS: { id: LayerId; label: string; description: string }[] = [
  { id: "wind10m", label: "10 m wind", description: "Wind speed + direction (knots) as arrows over a magnitude underlay." },
  { id: "pressure_msl", label: "Sea-level pressure", description: "Mean sea-level pressure (hPa) shaded." },
  { id: "precipitation", label: "Precipitation", description: "Hourly precipitation (mm) shaded." },
  { id: "temperature_2m", label: "2 m temperature", description: "Air temperature (°C) shaded." },
];

const STEP_H = 3;
const MAX_LEAD_H = 117;
const HOURS: number[] = Array.from({ length: Math.floor(MAX_LEAD_H / STEP_H) + 1 }, (_, i) => i * STEP_H);

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function WeatherModelChartViewer() {
  const [region, setRegion] = useState<WeatherChartRegionId>("europe");
  const [layer, setLayer] = useState<LayerId>("wind10m");
  const [lead, setLead] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; px: number; py: number } | null>(null);

  const activeLayer = useMemo(() => LAYERS.find((l) => l.id === layer) ?? LAYERS[0], [layer]);

  const url = useMemo(() => {
    const qs = new URLSearchParams({
      region,
      layer,
      lead: String(lead),
    });
    return `/api/weather/model-chart?${qs.toString()}`;
  }, [region, layer, lead]);

  // reset view on selection changes
  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [region, layer, lead]);

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

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setLead((h) => {
        const idx = HOURS.indexOf(h);
        const next = idx >= 0 ? HOURS[(idx + 1) % HOURS.length]! : 0;
        return next;
      });
    }, 700);
    return () => window.clearInterval(t);
  }, [playing]);

  const step = (dir: -1 | 1) => {
    setLead((h) => clamp(h + dir * STEP_H, 0, MAX_LEAD_H));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d?.active) return;
    setPan({ x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) });
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

  const leadIndex = Math.max(0, HOURS.indexOf(lead));

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Model chart viewer</h2>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            Generated maps from Open‑Meteo’s free GFS endpoint (no scraped images, no external iframes).
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {LAYERS.map((l) => {
          const isActive = l.id === layer;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setLayer(l.id)}
              className={
                isActive
                  ? "h-9 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white"
                  : "h-9 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              }
            >
              {l.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{activeLayer.label}</div>
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{activeLayer.description}</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
            <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Region</div>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as WeatherChartRegionId)}
              className="rounded-lg bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700"
            >
              {WEATHER_CHART_REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Forecast hour: <span className="font-mono text-zinc-900 dark:text-zinc-100">+{lead}h</span> · 3-hour steps · ~5 days
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                {playing ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={lead <= 0}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                −3h
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={lead >= MAX_LEAD_H}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                +3h
              </button>
              <button
                type="button"
                onClick={() => {
                  setScale(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                Reset view
              </button>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, HOURS.length - 1)}
            value={leadIndex}
            onChange={(e) => setLead(HOURS[Number(e.target.value)] ?? 0)}
            className="mt-3 w-full"
          />
          <div className="mt-2 flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="font-mono">+0h</span>
            <span className="font-mono">+{HOURS[Math.floor(HOURS.length / 2)]}h</span>
            <span className="font-mono">+{MAX_LEAD_H}h</span>
          </div>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative isolate h-[min(72vh,740px)] w-full cursor-grab overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 active:cursor-grabbing dark:border-zinc-800"
      >
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
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG served by our API */} 
          <img
            src={url}
            alt={`Model chart ${region} ${layer} +${lead}h`}
            className="max-h-full max-w-full select-none object-contain"
            draggable={false}
            loading="lazy"
          />
        </div>

        <p className="pointer-events-none absolute bottom-2 left-2 right-2 text-center text-[10px] text-zinc-400">
          Scroll to zoom · drag to pan when zoomed · data via Open‑Meteo
        </p>
      </div>
    </section>
  );
}

