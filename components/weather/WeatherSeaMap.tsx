"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

type LayerMode = "wind" | "waves" | "rain" | "pressure";
type BaseMapMode = "streets" | "light" | "satellite";

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function wavesColor(m: number): string {
  // 0..6m -> blue->cyan->green->yellow->orange->red
  const t = clamp(m / 6, 0, 1);
  const stops = [
    [0, 80, 220],
    [0, 200, 255],
    [60, 220, 140],
    [240, 220, 80],
    [245, 160, 60],
    [220, 60, 60],
  ] as const;
  const idx = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
  const localT = t * (stops.length - 1) - idx;
  const a = stops[idx]!;
  const b = stops[idx + 1]!;
  const r = Math.round(a[0] + (b[0] - a[0]) * localT);
  const g = Math.round(a[1] + (b[1] - a[1]) * localT);
  const bl = Math.round(a[2] + (b[2] - a[2]) * localT);
  return `rgba(${r},${g},${bl},0.68)`;
}

function OpenMeteoWavesOverlay({ enabled, timeIso, opacity }: { enabled: boolean; timeIso: string; opacity: number }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let overlay: L.ImageOverlay | null = null;
    let timer: number | null = null;

    const render = async () => {
      try {
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();

        // Sample a small grid across the viewport.
        const cols: number = 16;
        const rows: number = 10;
        const lats: number[] = [];
        const lngs: number[] = [];
        for (let y = 0; y < rows; y++) {
          const fy = rows === 1 ? 0.5 : y / (rows - 1);
          const lat = sw.lat + (ne.lat - sw.lat) * fy;
          for (let x = 0; x < cols; x++) {
            const fx = cols === 1 ? 0.5 : x / (cols - 1);
            const lng = sw.lng + (ne.lng - sw.lng) * fx;
            lats.push(Number(lat.toFixed(4)));
            lngs.push(Number(lng.toFixed(4)));
          }
        }

        const api = new URL("https://marine-api.open-meteo.com/v1/marine");
        api.searchParams.set("latitude", lats.join(","));
        api.searchParams.set("longitude", lngs.join(","));
        api.searchParams.set("hourly", "wave_height");
        api.searchParams.set("forecast_days", "5");
        api.searchParams.set("timezone", "GMT");

        const r = await fetch(api.toString(), { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as any;
        const blocks = Array.isArray(d) ? d : Array.isArray(d?.hourly?.time) ? [d] : [];
        if (!blocks.length) return;

        const times = blocks[0]?.hourly?.time as string[] | undefined;
        if (!times?.length) return;

        const targetMs = new Date(timeIso).getTime();
        let idx = 0;
        let best = Number.POSITIVE_INFINITY;
        for (let i = 0; i < times.length; i++) {
          const ms = new Date(times[i]!).getTime();
          const dist = Math.abs(ms - targetMs);
          if (dist < best) {
            best = dist;
            idx = i;
          }
        }

        const vals: number[] = [];
        for (const b of blocks) {
          const arr = b?.hourly?.wave_height as number[] | undefined;
          vals.push(typeof arr?.[idx] === "number" ? arr[idx] : NaN);
        }

        const canvas = document.createElement("canvas");
        canvas.width = cols * 24;
        canvas.height = rows * 24;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = clamp(opacity, 0.2, 0.95);
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const v = vals[y * cols + x]!;
            if (!Number.isFinite(v)) continue;
            ctx.fillStyle = wavesColor(v);
            ctx.fillRect(x * 24, y * 24, 24, 24);
          }
        }

        const url = canvas.toDataURL("image/png");
        const imgBounds = L.latLngBounds([sw.lat, sw.lng], [ne.lat, ne.lng]);

        if (overlay) {
          overlay.setUrl(url);
          overlay.setBounds(imgBounds);
        } else {
          overlay = L.imageOverlay(url, imgBounds, { opacity: 1 });
          overlay.addTo(map);
        }
      } catch {
        /* ignore */
      }
    };

    const schedule = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void render(), 300);
    };

    schedule();
    const onMove = () => schedule();
    map.on("moveend", onMove);

    return () => {
      disposed = true;
      if (timer != null) window.clearTimeout(timer);
      map.off("moveend", onMove);
      if (overlay) map.removeLayer(overlay);
      overlay = null;
      void disposed;
    };
  }, [map, enabled, timeIso, opacity]);

  return null;
}

function WmsOverlay({ mode, opacity, timeIso }: { mode: LayerMode; opacity: number; timeIso: string }) {
  const map = useMap();

  useEffect(() => {
    if (mode === "waves") return;
    const windUrl =
      "https://pae-paha.pacioos.hawaii.edu/thredds/wms/ncep_global/NCEP_Global_Atmospheric_Model_best.ncd";
    const wavesUrl =
      "https://pae-paha.pacioos.hawaii.edu/thredds/wms/ww3_global/WaveWatch_III_Global_Wave_Model_fmrc.ncd";

    // PacIOOS exposes a combined vector field layer "wind" with barb/vector styles and a time dimension.
    const wind = L.tileLayer.wms(windUrl, {
      layers: "wind",
      styles: "barb/jet",
      format: "image/png",
      transparent: true,
      opacity,
      version: "1.3.0",
      time: timeIso,
    } as any);

    const waves = L.tileLayer.wms(wavesUrl, {
      layers: "Thgt",
      styles: "boxfill/jet",
      format: "image/png",
      transparent: true,
      opacity,
      version: "1.3.0",
      time: timeIso,
    } as any);

    const rain = L.tileLayer.wms(windUrl, {
      layers: "pratesfc",
      styles: "boxfill/occam",
      format: "image/png",
      transparent: true,
      opacity,
      version: "1.3.0",
      time: timeIso,
    } as any);

    const pressure = L.tileLayer.wms(windUrl, {
      layers: "prmslmsl",
      styles: "boxfill/jet",
      format: "image/png",
      transparent: true,
      opacity,
      version: "1.3.0",
      time: timeIso,
    } as any);

    const layer = mode === "wind" ? wind : mode === "rain" ? rain : pressure;
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
      map.removeLayer(wind);
      map.removeLayer(waves);
      map.removeLayer(rain);
      map.removeLayer(pressure);
    };
  }, [map, mode, opacity, timeIso]);

  return null;
}

function roundTo3hUtc(d: Date): Date {
  const ms = d.getTime();
  const threeH = 3 * 60 * 60 * 1000;
  return new Date(Math.floor(ms / threeH) * threeH);
}

function buildFrames4d(): string[] {
  const start = roundTo3hUtc(new Date());
  const out: string[] = [];
  const step = 3 * 60 * 60 * 1000;
  const end = start.getTime() + 4 * 24 * 60 * 60 * 1000;
  for (let t = start.getTime(); t <= end; t += step) {
    out.push(new Date(t).toISOString().replace(/\.\d{3}Z$/, ".000Z"));
  }
  return out;
}

export function WeatherSeaMap() {
  const [mode, setMode] = useState<LayerMode>("wind");
  const [base, setBase] = useState<BaseMapMode>("satellite");
  const [opacity, setOpacity] = useState(0.75);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [initialCenter, setInitialCenter] = useState<[number, number] | null>(null);
  const frames = useMemo(() => buildFrames4d(), []);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let disposed = false;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (disposed) return;
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPos(next);
        if (!initialCenter) setInitialCenter([next.lat, next.lng]);
      },
      () => {
        /* ignore */
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 },
    );
    return () => {
      disposed = true;
    };
  }, [initialCenter]);

  const center = useMemo<[number, number]>(() => initialCenter ?? [20, 0], [initialCenter]);
  const timeIso = frames[Math.min(Math.max(frameIdx, 0), frames.length - 1)] ?? new Date().toISOString();

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setFrameIdx((i) => {
        const next = i + 1;
        if (next >= frames.length) return 0;
        return next;
      });
    }, 900);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => setBase("satellite")}
              className={`h-9 px-3 text-sm font-semibold ${
                base === "satellite"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Satellite
            </button>
            <button
              type="button"
              onClick={() => setBase("streets")}
              className={`h-9 px-3 text-sm font-semibold ${
                base === "streets"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Streets
            </button>
            <button
              type="button"
              onClick={() => setBase("light")}
              className={`h-9 px-3 text-sm font-semibold ${
                base === "light"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Light
            </button>
          </div>

          <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <button
            type="button"
            onClick={() => setMode("wind")}
            className={`h-9 px-3 text-sm font-semibold ${
              mode === "wind"
                ? "bg-indigo-600 text-white"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            Wind
          </button>
          <button
            type="button"
            onClick={() => setMode("waves")}
            className={`h-9 px-3 text-sm font-semibold ${
              mode === "waves"
                ? "bg-indigo-600 text-white"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            Waves
          </button>
          <button
            type="button"
            onClick={() => setMode("rain")}
            className={`h-9 px-3 text-sm font-semibold ${
              mode === "rain"
                ? "bg-indigo-600 text-white"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            Rain
          </button>
          <button
            type="button"
            onClick={() => setMode("pressure")}
            className={`h-9 px-3 text-sm font-semibold ${
              mode === "pressure"
                ? "bg-indigo-600 text-white"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            Pressure
          </button>
        </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Time</span>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              title="Play/pause forecast animation"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <span className="text-[11px] text-zinc-500">
              {new Date(timeIso).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            step={1}
            value={frameIdx}
            onChange={(e) => {
              setPlaying(false);
              setFrameIdx(Number(e.target.value));
            }}
            className="w-48"
            aria-label="Forecast time"
          />

          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Overlay</span>
          <input
            type="range"
            min={0.2}
            max={0.95}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
          />
          <span className="w-10 text-right text-xs text-zinc-500">{Math.round(opacity * 100)}%</span>
        </div>
      </div>

      <div className="h-[min(70vh,620px)] w-full bg-zinc-100 dark:bg-zinc-900">
        <MapContainer
          center={center}
          zoom={pos ? 7 : 2}
          maxZoom={18}
          className="h-full w-full"
          scrollWheelZoom
          attributionControl
        >
          {base === "satellite" ? (
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          ) : base === "light" ? (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
              detectRetina
            />
          ) : (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
              detectRetina
            />
          )}
          {/* Use Open-Meteo raster for waves to ensure coverage in enclosed seas like the Mediterranean. */}
          <OpenMeteoWavesOverlay enabled={mode === "waves"} timeIso={timeIso} opacity={opacity} />
          <WmsOverlay mode={mode} opacity={opacity} timeIso={timeIso} />
        </MapContainer>
      </div>
      <div className="border-t border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <span className="font-semibold text-zinc-800 dark:text-zinc-200">Tip:</span> drag/zoom anywhere in the world —
        this map won’t snap back to you. Use Play to step through the next 4 days of model frames.
      </div>
    </div>
  );
}

