"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AttributionControl,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { WEATHER_CHART_REGIONS, getWeatherChartRegion, type WeatherChartRegionId } from "@/lib/weather/model-chart-regions";

type LayerId = "wind10m" | "waves" | "pressure_msl" | "precipitation" | "temperature_2m";

const LAYERS: { id: LayerId; label: string; description: string }[] = [
  { id: "wind10m", label: "10 m wind", description: "GFS wind speed (kn) and direction at each point — arrows show where the wind blows." },
  { id: "waves", label: "Waves", description: "Marine wave height (m) and direction from Open‑Meteo — arrows show swell propagation." },
  { id: "pressure_msl", label: "Sea-level pressure", description: "MSLP (hPa) as coloured markers." },
  { id: "precipitation", label: "Precipitation", description: "Hourly precipitation (mm) as coloured markers." },
  { id: "temperature_2m", label: "2 m temperature", description: "Air temperature (°C) as coloured markers." },
];

const STEP_H = 3;
const MAX_LEAD_H = 117;
const HOURS: number[] = Array.from({ length: Math.floor(MAX_LEAD_H / STEP_H) + 1 }, (_, i) => i * STEP_H);

type MapPoint = {
  lat: number;
  lng: number;
  windSpeedKn?: number | null;
  windDirFromDeg?: number | null;
  pressureHpa?: number | null;
  precipMm?: number | null;
  tempC?: number | null;
  waveHeightM?: number | null;
  waveDirFromDeg?: number | null;
};

type ApiOk = {
  ok: true;
  region: WeatherChartRegionId;
  leadHours: number;
  timeIso: string | null;
  points: MapPoint[];
  fetchedAtIso: string;
};

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

/** Meteorological FROM → rotation (deg) for an arrow that points where the flow goes (CSS, clockwise from north). */
function flowRotationFromFromDeg(fromDeg: number): number {
  const v = ((fromDeg + 180) % 360 + 360) % 360;
  return v;
}

function windColorKn(kn: number): string {
  const t = clamp(kn / 40, 0, 1);
  if (t < 0.33) return `rgba(56,189,248,${0.85 + t * 0.1})`;
  if (t < 0.66) return `rgba(250,204,21,${0.9})`;
  return `rgba(248,113,113,${0.95})`;
}

function windArrowIcon(fromDeg: number, speedKn: number): L.DivIcon {
  const rot = flowRotationFromFromDeg(fromDeg);
  const t = clamp(speedKn / 48, 0, 1);
  const h = Math.round(12 + t * 16);
  const w = Math.max(5, Math.round(h * 0.42));
  const color = windColorKn(speedKn);
  const html = `<div style="width:0;height:0;border-left:${w}px solid transparent;border-right:${w}px solid transparent;border-bottom:${h}px solid ${color};transform:rotate(${rot}deg);transform-origin:50% 72%;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))"></div>`;
  return L.divIcon({
    className: "sealink-model-wind-arrow",
    html,
    iconSize: [w * 2, h],
    iconAnchor: [w, Math.round(h * 0.72)],
  });
}

function waveHeightColor(m: number): string {
  const t = clamp(m / 5, 0, 1);
  const stops = [
    [15, 80, 160],
    [40, 140, 220],
    [80, 210, 200],
    [240, 210, 90],
    [240, 120, 60],
    [220, 60, 60],
  ] as const;
  const idx = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
  const localT = t * (stops.length - 1) - idx;
  const a = stops[idx]!;
  const b = stops[idx + 1]!;
  const r = Math.round(a[0] + (b[0] - a[0]) * localT);
  const g = Math.round(a[1] + (b[1] - a[1]) * localT);
  const bl = Math.round(a[2] + (b[2] - a[2]) * localT);
  return `rgba(${r},${g},${bl},0.88)`;
}

function waveArrowIcon(fromDeg: number, heightM: number): L.DivIcon {
  const rot = flowRotationFromFromDeg(fromDeg);
  const t = clamp(heightM / 4, 0.2, 1);
  const h = Math.round(10 + t * 12);
  const w = Math.max(4, Math.round(h * 0.4));
  const color = "rgba(147,197,253,0.95)";
  const html = `<div style="width:0;height:0;border-left:${w}px solid transparent;border-right:${w}px solid transparent;border-bottom:${h}px solid ${color};transform:rotate(${rot}deg);transform-origin:50% 72%;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"></div>`;
  return L.divIcon({
    className: "sealink-model-wave-arrow",
    html,
    iconSize: [w * 2, h],
    iconAnchor: [w, Math.round(h * 0.72)],
  });
}

function precipColor(mm: number): string {
  const t = clamp(mm / 8, 0, 1);
  const r = Math.round(180 + 75 * t);
  const g = Math.round(220 - 140 * t);
  const b = Math.round(255 - 200 * t);
  return `rgba(${r},${g},${b},0.85)`;
}

function pressureColor(hpa: number): string {
  const t = clamp((hpa - 980) / 70, 0, 1);
  const r = Math.round(80 + 175 * t);
  const g = Math.round(160 + 60 * (1 - Math.abs(t - 0.5) * 2));
  const b = Math.round(240 - 180 * t);
  return `rgba(${r},${g},${b},0.88)`;
}

function tempColor(c: number): string {
  const t = clamp((c + 5) / 35, 0, 1);
  const r = Math.round(50 + 205 * t);
  const g = Math.round(100 + 155 * (1 - Math.abs(t - 0.45)));
  const b = Math.round(220 - 200 * t);
  return `rgba(${r},${g},${b},0.88)`;
}

function FitBoundsTrigger({
  bounds,
  trigger,
}: {
  bounds: L.LatLngBoundsExpression;
  trigger: number;
}) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 8 });
  }, [map, bounds, trigger]);
  return null;
}

export function WeatherModelChartViewer() {
  const [region, setRegion] = useState<WeatherChartRegionId>("europe");
  const [layer, setLayer] = useState<LayerId>("wind10m");
  const [lead, setLead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fitTick, setFitTick] = useState(0);
  const [data, setData] = useState<ApiOk | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const regionConfig = useMemo(() => getWeatherChartRegion(region), [region]);
  const activeLayer = useMemo(() => LAYERS.find((l) => l.id === layer) ?? LAYERS[0], [layer]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadErr(null);
      try {
        const qs = new URLSearchParams({ region, lead: String(lead) });
        const r = await fetch(`/api/weather/model-map-data?${qs.toString()}`, { cache: "no-store" });
        const j = (await r.json()) as ApiOk | { error?: string };
        if (!r.ok || !("ok" in j) || !j.ok) throw new Error((j as { error?: string }).error || "Fetch failed");
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setLoadErr(e instanceof Error ? e.message : "Could not load forecast grid");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [region, lead]);

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setLead((h) => {
        const idx = HOURS.indexOf(h);
        const next = idx >= 0 ? HOURS[(idx + 1) % HOURS.length]! : 0;
        return next;
      });
    }, 750);
    return () => window.clearInterval(t);
  }, [playing]);

  const step = useCallback((dir: -1 | 1) => {
    setLead((h) => clamp(h + dir * STEP_H, 0, MAX_LEAD_H));
  }, []);

  const leadIndex = Math.max(0, HOURS.indexOf(lead));
  const points = data?.points ?? [];

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Model chart viewer</h2>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            OpenStreetMap basemap with GFS / marine overlays from Open‑Meteo (server-cached). No Wetterzentrale, no chart iframes.
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
            {data?.timeIso ? (
              <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">Step: +{lead}h · {data.timeIso}</p>
            ) : null}
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
              Timeline · <span className="font-mono text-zinc-900 dark:text-zinc-100">+{lead}h</span> · 3-hour steps · ~5 days
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
                onClick={() => setFitTick((n) => n + 1)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                Fit region
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

      {loadErr ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
          {loadErr}
        </p>
      ) : null}

      <div className="relative min-h-[min(72vh,760px)] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
        {loading ? (
          <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-zinc-950/25 text-xs font-semibold text-zinc-800 dark:text-zinc-100">
            Loading forecast grid…
          </div>
        ) : null}
        <MapContainer
          className="h-[min(72vh,760px)] w-full"
          bounds={regionConfig.mapBounds}
          boundsOptions={{ padding: [28, 28], maxZoom: 8 }}
          scrollWheelZoom
          attributionControl={false}
        >
          <AttributionControl position="bottomright" prefix={false} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBoundsTrigger bounds={regionConfig.mapBounds} trigger={fitTick} />

          {layer === "wind10m"
            ? points.map((p, i) => {
                const sp = p.windSpeedKn;
                const dir = p.windDirFromDeg;
                if (sp == null || dir == null || !Number.isFinite(sp) || !Number.isFinite(dir)) return null;
                return (
                  <Marker key={`w-${i}`} position={[p.lat, p.lng]} icon={windArrowIcon(dir, sp)}>
                    <Popup>
                      <div className="text-xs">
                        <div className="font-semibold">10 m wind</div>
                        <div>{sp.toFixed(0)} kn</div>
                        <div className="text-zinc-500">From {Math.round(dir)}°</div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })
            : null}

          {layer === "waves"
            ? points.map((p, i) => {
                const h = p.waveHeightM;
                if (h == null || !Number.isFinite(h) || h < 0.05) return null;
                const color = waveHeightColor(h);
                return (
                  <CircleMarker
                    key={`wh-${i}`}
                    center={[p.lat, p.lng]}
                    radius={6 + clamp(h, 0, 4) * 2}
                    pathOptions={{ color: "rgba(255,255,255,0.35)", weight: 1, fillColor: color, fillOpacity: 0.9 }}
                  >
                    <Popup>
                      <div className="text-xs">
                        <div className="font-semibold">Wave height</div>
                        <div>{h.toFixed(2)} m</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })
            : null}

          {layer === "waves"
            ? points.map((p, i) => {
                const h = p.waveHeightM;
                const wd = p.waveDirFromDeg;
                if (h == null || wd == null || !Number.isFinite(h) || h < 0.15 || !Number.isFinite(wd)) return null;
                return (
                  <Marker key={`wa-${i}`} position={[p.lat, p.lng]} icon={waveArrowIcon(wd, h)}>
                    <Popup>
                      <div className="text-xs">
                        <div className="font-semibold">Wave direction</div>
                        <div>From {Math.round(wd)}°</div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })
            : null}

          {layer === "pressure_msl"
            ? points.map((p, i) => {
                const hpa = p.pressureHpa;
                if (hpa == null || !Number.isFinite(hpa)) return null;
                const color = pressureColor(hpa);
                return (
                  <CircleMarker
                    key={`p-${i}`}
                    center={[p.lat, p.lng]}
                    radius={7}
                    pathOptions={{ color: "rgba(255,255,255,0.25)", weight: 1, fillColor: color, fillOpacity: 0.9 }}
                  >
                    <Popup>
                      <div className="text-xs font-semibold">{Math.round(hpa)} hPa</div>
                    </Popup>
                  </CircleMarker>
                );
              })
            : null}

          {layer === "precipitation"
            ? points.map((p, i) => {
                const mm = p.precipMm;
                if (mm == null || !Number.isFinite(mm)) return null;
                const color = precipColor(mm);
                const r = mm < 0.05 ? 4 : 5 + clamp(mm, 0, 6);
                return (
                  <CircleMarker
                    key={`pr-${i}`}
                    center={[p.lat, p.lng]}
                    radius={r}
                    pathOptions={{ color: "rgba(255,255,255,0.2)", weight: 1, fillColor: color, fillOpacity: 0.88 }}
                  >
                    <Popup>
                      <div className="text-xs font-semibold">{mm.toFixed(2)} mm/h</div>
                    </Popup>
                  </CircleMarker>
                );
              })
            : null}

          {layer === "temperature_2m"
            ? points.map((p, i) => {
                const tc = p.tempC;
                if (tc == null || !Number.isFinite(tc)) return null;
                const color = tempColor(tc);
                return (
                  <CircleMarker
                    key={`t-${i}`}
                    center={[p.lat, p.lng]}
                    radius={6}
                    pathOptions={{ color: "rgba(255,255,255,0.25)", weight: 1, fillColor: color, fillOpacity: 0.9 }}
                  >
                    <Popup>
                      <div className="text-xs font-semibold">{tc.toFixed(1)} °C</div>
                    </Popup>
                  </CircleMarker>
                );
              })
            : null}
        </MapContainer>
      </div>

      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
        Pan and zoom the map. Wind/wave arrows point <strong>downwind</strong> / <strong>along swell propagation</strong> (from meteorological “from” directions in the API).
      </p>
    </section>
  );
}
