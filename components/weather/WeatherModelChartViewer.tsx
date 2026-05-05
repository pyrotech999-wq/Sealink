"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AttributionControl,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  Rectangle,
  TileLayer,
  useMap,
} from "react-leaflet";
import { WEATHER_CHART_REGIONS, getWeatherChartRegion, type WeatherChartRegionId } from "@/lib/weather/model-chart-regions";

type LayerId = "wind10m" | "waves" | "pressure_msl" | "precipitation" | "temperature_2m";

const LAYERS: { id: LayerId; label: string; description: string }[] = [
  { id: "wind10m", label: "10 m wind", description: "GFS wind (kn): arrow points downwind; size and colour scale with speed." },
  { id: "waves", label: "Waves", description: "Marine wave height (m) and direction — arrows where swell is meaningful." },
  { id: "pressure_msl", label: "Sea-level pressure", description: "MSLP (hPa): sampled value labels, low/high centres (L/H)." },
  { id: "precipitation", label: "Precipitation", description: "Hourly precipitation (mm) as semi-transparent tiles." },
  { id: "temperature_2m", label: "2 m temperature", description: "Air temperature (°C) as semi-transparent tiles." },
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
  layer: LayerId;
  leadHours: number;
  timeIso: string | null;
  validCount: number;
  points: MapPoint[];
  fetchedAtIso: string;
};

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function flowRotationFromFromDeg(fromDeg: number): number {
  return ((fromDeg + 180) % 360 + 360) % 360;
}

function windColorKn(kn: number): string {
  const t = clamp(kn / 40, 0, 1);
  if (t < 0.33) return `rgba(56,189,248,${0.88 + t * 0.08})`;
  if (t < 0.66) return `rgba(250,204,21,0.92)`;
  return `rgba(248,113,113,0.95)`;
}

function windArrowIcon(fromDeg: number, speedKn: number): L.DivIcon {
  const rot = flowRotationFromFromDeg(fromDeg);
  const t = clamp(speedKn / 48, 0, 1);
  const h = Math.round(14 + t * 20);
  const w = Math.max(5, Math.round(h * 0.42));
  const color = windColorKn(speedKn);
  const html = `<div style="width:0;height:0;border-left:${w}px solid transparent;border-right:${w}px solid transparent;border-bottom:${h}px solid ${color};transform:rotate(${rot}deg);transform-origin:50% 72%;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))"></div>`;
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
  return `rgba(${r},${g},${bl},0.82)`;
}

function waveArrowIcon(fromDeg: number, heightM: number): L.DivIcon {
  const rot = flowRotationFromFromDeg(fromDeg);
  const t = clamp(heightM / 4, 0.2, 1);
  const h = Math.round(12 + t * 14);
  const w = Math.max(4, Math.round(h * 0.4));
  const color = "rgba(186,230,253,0.95)";
  const html = `<div style="width:0;height:0;border-left:${w}px solid transparent;border-right:${w}px solid transparent;border-bottom:${h}px solid ${color};transform:rotate(${rot}deg);transform-origin:50% 72%;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))"></div>`;
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
  return `rgba(${r},${g},${b},0.72)`;
}

/** Low &lt; 1000, normal 1000–1020, high &gt; 1020 hPa. */
function pressureLabelColors(hpa: number): { bg: string; fg: string; border: string } {
  if (hpa < 1000) {
    return { bg: "rgba(76,29,149,0.92)", fg: "#f5f3ff", border: "rgba(196,181,253,0.55)" };
  }
  if (hpa > 1020) {
    return { bg: "rgba(217,119,6,0.92)", fg: "#1c1917", border: "rgba(254,240,138,0.65)" };
  }
  return { bg: "rgba(87,110,96,0.9)", fg: "#ecfdf5", border: "rgba(167,243,208,0.45)" };
}

function pressureLabelIcon(hpa: number): L.DivIcon {
  const { bg, fg, border } = pressureLabelColors(hpa);
  const text = `${Math.round(hpa)} hPa`;
  const html = `<div style="padding:2px 7px;font:600 10px ui-monospace,Menlo,monospace;color:${fg};background:${bg};border:1px solid ${border};border-radius:7px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.4)">${text}</div>`;
  return L.divIcon({
    className: "sealink-pressure-label",
    html,
    iconSize: [58, 20],
    iconAnchor: [29, 10],
  });
}

function extremaPressureIcon(letter: "L" | "H"): L.DivIcon {
  const bg = letter === "L" ? "#4c1d95" : "#c2410c";
  const html = `<div style="font:800 12px system-ui,sans-serif;color:#fff;background:${bg};border:2px solid rgba(255,255,255,.92);border-radius:999px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4)">${letter}</div>`;
  return L.divIcon({
    className: "sealink-pressure-extrema",
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function tempColor(c: number): string {
  const t = clamp((c + 5) / 35, 0, 1);
  const r = Math.round(50 + 205 * t);
  const g = Math.round(100 + 155 * (1 - Math.abs(t - 0.45)));
  const b = Math.round(220 - 200 * t);
  return `rgba(${r},${g},${b},0.72)`;
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

function LayerLegend({ layer }: { layer: LayerId }) {
  if (layer === "wind10m") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-[10px] shadow-sm dark:border-zinc-700 dark:bg-zinc-950/95">
        <div className="font-semibold text-zinc-800 dark:text-zinc-100">Wind speed (kn)</div>
        <div
          className="mt-1 h-2.5 w-full rounded-md"
          style={{
            background: "linear-gradient(90deg, rgb(56,189,248), rgb(250,204,21), rgb(248,113,113))",
          }}
        />
        <div className="mt-0.5 flex justify-between font-mono text-zinc-500 dark:text-zinc-400">
          <span>0</span>
          <span>20</span>
          <span>40+</span>
        </div>
      </div>
    );
  }
  if (layer === "waves") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-[10px] shadow-sm dark:border-zinc-700 dark:bg-zinc-950/95">
        <div className="font-semibold text-zinc-800 dark:text-zinc-100">Wave height (m)</div>
        <div
          className="mt-1 h-2.5 w-full rounded-md"
          style={{
            background: "linear-gradient(90deg, rgb(15,80,160), rgb(80,210,200), rgb(240,210,90), rgb(220,60,60))",
          }}
        />
        <div className="mt-0.5 flex justify-between font-mono text-zinc-500 dark:text-zinc-400">
          <span>0</span>
          <span>2</span>
          <span>5+</span>
        </div>
      </div>
    );
  }
  if (layer === "pressure_msl") {
    return (
      <div className="max-w-[260px] rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-[10px] shadow-sm dark:border-zinc-700 dark:bg-zinc-950/95">
        <div className="font-semibold text-zinc-800 dark:text-zinc-100">Sea-level pressure</div>
        <ul className="mt-2 list-none space-y-1.5 text-zinc-700 dark:text-zinc-200">
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[rgb(76,29,149)]" />
            <span>
              Low · <span className="font-mono">&lt; 1000</span> hPa
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[rgb(87,110,96)]" />
            <span>
              Normal · <span className="font-mono">1000–1020</span> hPa
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[rgb(217,119,6)]" />
            <span>
              High · <span className="font-mono">&gt; 1020</span> hPa
            </span>
          </li>
        </ul>
        <p className="mt-2 border-t border-zinc-200 pt-1.5 text-[9px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          L / H mark the lowest / highest value in the sampled grid for this hour.
        </p>
      </div>
    );
  }
  if (layer === "precipitation") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-[10px] shadow-sm dark:border-zinc-700 dark:bg-zinc-950/95">
        <div className="font-semibold text-zinc-800 dark:text-zinc-100">Precipitation (mm / h)</div>
        <div
          className="mt-1 h-2.5 w-full rounded-md"
          style={{
            background: "linear-gradient(90deg, rgba(200,230,255,0.9), rgb(100,180,255), rgb(255,120,80))",
          }}
        />
        <div className="mt-0.5 flex justify-between font-mono text-zinc-500 dark:text-zinc-400">
          <span>0</span>
          <span>2</span>
          <span>8+</span>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-[10px] shadow-sm dark:border-zinc-700 dark:bg-zinc-950/95">
      <div className="font-semibold text-zinc-800 dark:text-zinc-100">Temperature (°C)</div>
      <div
        className="mt-1 h-2.5 w-full rounded-md"
        style={{
          background: "linear-gradient(90deg, rgb(70,120,255), rgb(140,235,160), rgb(255,100,70))",
        }}
      />
      <div className="mt-0.5 flex justify-between font-mono text-zinc-500 dark:text-zinc-400">
        <span>-5</span>
        <span>15</span>
        <span>30+</span>
      </div>
    </div>
  );
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
  const fetchGen = useRef(0);

  const regionConfig = useMemo(() => getWeatherChartRegion(region), [region]);
  const activeLayer = useMemo(() => LAYERS.find((l) => l.id === layer) ?? LAYERS[0], [layer]);

  const cellHalfDeg = useMemo(() => regionConfig.stepDeg * 0.4, [regionConfig.stepDeg]);

  useEffect(() => {
    console.info("WEATHER_STEP_CHANGE", { region, layer, lead });
  }, [region, layer, lead]);

  useEffect(() => {
    const gen = ++fetchGen.current;
    const ac = new AbortController();
    setLoading(true);
    setLoadErr(null);
    setData(null);

    (async () => {
      try {
        const qs = new URLSearchParams({ region, lead: String(lead), layer });
        const r = await fetch(`/api/weather/model-map-data?${qs.toString()}`, { cache: "no-store", signal: ac.signal });
        const j = (await r.json()) as ApiOk | { error?: string };
        if (gen !== fetchGen.current) return;
        if (!r.ok || !("ok" in j) || !j.ok) throw new Error((j as { error?: string }).error || "Fetch failed");
        setData(j);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (gen !== fetchGen.current) return;
        setData(null);
        setLoadErr(e instanceof Error ? e.message : "Could not load forecast grid");
      } finally {
        if (gen === fetchGen.current) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [region, lead, layer]);

  useEffect(() => {
    if (!data || loading) return;
    if (data.leadHours !== lead || data.layer !== layer || data.region !== region) return;
    console.info("WEATHER_GRID_RENDER", {
      region: data.region,
      layer: data.layer,
      leadHours: data.leadHours,
      validCount: data.validCount,
      pointCount: data.points.length,
    });
  }, [data, loading, lead, layer, region]);

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

  const dataMatchesUi =
    data != null && data.leadHours === lead && data.layer === layer && data.region === region;
  const timestepEmpty = dataMatchesUi && data.validCount === 0 && !loading;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Model chart viewer</h2>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            OpenStreetMap + Open‑Meteo (GFS / marine). Data loads per region, layer, and forecast hour (server cache ~12 min).
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
            {dataMatchesUi && data.timeIso ? (
              <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                Step: +{lead}h · {data.timeIso} · {data.validCount} points
              </p>
            ) : null}
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
            <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Region</div>
            <select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value as WeatherChartRegionId);
                setFitTick((n) => n + 1);
              }}
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
              Timeline · <span className="font-mono text-zinc-900 dark:text-zinc-100">+{lead}h</span> · 3-hour steps
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

      {timestepEmpty ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
          No usable data for <strong>{activeLayer.label}</strong> at <strong>+{lead}h</strong> in this region (try another hour, layer, or coastal area for waves).
        </p>
      ) : null}

      <div className="relative min-h-[min(72vh,760px)] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="pointer-events-none absolute left-3 top-3 z-[400] max-w-[220px]">
          <LayerLegend layer={layer} />
        </div>

        {loading ? (
          <div className="pointer-events-none absolute inset-0 z-[500] flex flex-col items-center justify-center gap-1 bg-zinc-950/30 text-xs font-semibold text-zinc-900 dark:text-zinc-50">
            <span>Loading +{lead}h…</span>
            <span className="text-[10px] font-normal text-zinc-600 dark:text-zinc-300">{activeLayer.label}</span>
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

          {dataMatchesUi && layer === "wind10m"
            ? points.map((p, i) => {
                const sp = p.windSpeedKn;
                const dir = p.windDirFromDeg;
                if (sp == null || dir == null || !Number.isFinite(sp) || !Number.isFinite(dir)) return null;
                return (
                  <Marker
                    key={`w-${lead}-${i}-${sp}-${dir}`}
                    position={[p.lat, p.lng]}
                    icon={windArrowIcon(dir, sp)}
                  >
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

          {dataMatchesUi && layer === "waves"
            ? points.map((p, i) => {
                const h = p.waveHeightM;
                if (h == null || !Number.isFinite(h) || h < 0.05) return null;
                const color = waveHeightColor(h);
                return (
                  <CircleMarker
                    key={`wh-${lead}-${i}-${h}`}
                    center={[p.lat, p.lng]}
                    radius={7 + clamp(h, 0, 4) * 2.2}
                    pathOptions={{ color: "rgba(255,255,255,0.35)", weight: 1, fillColor: color, fillOpacity: 0.88 }}
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

          {dataMatchesUi && layer === "waves"
            ? points.map((p, i) => {
                const h = p.waveHeightM;
                const wd = p.waveDirFromDeg;
                if (h == null || wd == null || !Number.isFinite(h) || h < 0.12 || !Number.isFinite(wd)) return null;
                return (
                  <Marker key={`wa-${lead}-${i}-${h}-${wd}`} position={[p.lat, p.lng]} icon={waveArrowIcon(wd, h)}>
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

          {dataMatchesUi && layer === "pressure_msl"
            ? points.map((p, i) => {
                const hpa = p.pressureHpa;
                if (hpa == null || !Number.isFinite(hpa)) return null;
                const color = pressureColor(hpa);
                const d = cellHalfDeg;
                return (
                  <Rectangle
                    key={`p-${lead}-${i}-${hpa}`}
                    bounds={[
                      [p.lat - d, p.lng - d],
                      [p.lat + d, p.lng + d],
                    ]}
                    pathOptions={{
                      color: "rgba(255,255,255,0.15)",
                      weight: 1,
                      fillColor: color,
                      fillOpacity: 0.55,
                    }}
                  >
                    <Popup>
                      <div className="text-xs font-semibold">{Math.round(hpa)} hPa</div>
                    </Popup>
                  </Rectangle>
                );
              })
            : null}

          {dataMatchesUi && layer === "precipitation"
            ? points.map((p, i) => {
                const mm = p.precipMm;
                if (mm == null || !Number.isFinite(mm)) return null;
                const color = precipColor(mm);
                const d = cellHalfDeg * (mm < 0.05 ? 0.65 : 1);
                return (
                  <Rectangle
                    key={`pr-${lead}-${i}-${mm}`}
                    bounds={[
                      [p.lat - d, p.lng - d],
                      [p.lat + d, p.lng + d],
                    ]}
                    pathOptions={{
                      color: "rgba(255,255,255,0.12)",
                      weight: 1,
                      fillColor: color,
                      fillOpacity: 0.52,
                    }}
                  >
                    <Popup>
                      <div className="text-xs font-semibold">{mm.toFixed(2)} mm/h</div>
                    </Popup>
                  </Rectangle>
                );
              })
            : null}

          {dataMatchesUi && layer === "temperature_2m"
            ? points.map((p, i) => {
                const tc = p.tempC;
                if (tc == null || !Number.isFinite(tc)) return null;
                const color = tempColor(tc);
                const d = cellHalfDeg;
                return (
                  <Rectangle
                    key={`t-${lead}-${i}-${tc}`}
                    bounds={[
                      [p.lat - d, p.lng - d],
                      [p.lat + d, p.lng + d],
                    ]}
                    pathOptions={{
                      color: "rgba(255,255,255,0.15)",
                      weight: 1,
                      fillColor: color,
                      fillOpacity: 0.55,
                    }}
                  >
                    <Popup>
                      <div className="text-xs font-semibold">{tc.toFixed(1)} °C</div>
                    </Popup>
                  </Rectangle>
                );
              })
            : null}
        </MapContainer>
      </div>

      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
        Arrows use meteorological “from” directions from the API and are drawn <strong>downwind</strong> (wind) or <strong>along propagation</strong> (waves).
      </p>
    </section>
  );
}
