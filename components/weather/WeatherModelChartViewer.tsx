"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import { Activity, Waves } from "lucide-react";
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

type LayerId = "wind10m" | "waves";

const LAYERS: { id: LayerId; label: string; description: string }[] = [
  { id: "wind10m", label: "Wind", description: "GFS wind (kn): arrow points downwind; size and colour scale with speed." },
  { id: "waves", label: "Waves", description: "Marine wave height (m) and direction — arrows where swell is meaningful." },
];

const STEP_H = 3;
const MAX_LEAD_H = 117;
const HOURS: number[] = Array.from({ length: Math.floor(MAX_LEAD_H / STEP_H) + 1 }, (_, i) => i * STEP_H);

type MapPoint = {
  lat: number;
  lng: number;
  windSpeedKn?: number | null;
  windDirFromDeg?: number | null;
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
  stale?: boolean;
};

type ApiBatch = {
  ok: true;
  batch: true;
  region: WeatherChartRegionId;
  layer: LayerId;
  stale?: boolean;
  items: ApiOk[];
};

const CLIENT_FETCH_THROTTLE_MS = 2500;
const CLIENT_RETRY_DELAY_MS = 7000;

/** Keep grid responses for 6h; initial load reads from localStorage before any fetch. */
const GRID_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const GRID_CACHE_LS_KEY = "sealink-weather-model-grid-v1";

type GridCacheEntry = { storedAtMs: number; data: ApiOk };

function gridCacheKey(region: WeatherChartRegionId, layer: LayerId, leadHours: number): string {
  return `${region}|${layer}|${leadHours}`;
}

function gridEntryFresh(e: GridCacheEntry): boolean {
  return Date.now() - e.storedAtMs < GRID_CACHE_MAX_AGE_MS;
}

function readPersistedGridCache(): Map<string, GridCacheEntry> {
  const out = new Map<string, GridCacheEntry>();
  if (typeof window === "undefined") return out;
  try {
    const raw = localStorage.getItem(GRID_CACHE_LS_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as { entries?: Record<string, GridCacheEntry> };
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed.entries ?? {})) {
      if (!v?.data?.ok || typeof v.storedAtMs !== "number") continue;
      if (now - v.storedAtMs >= GRID_CACHE_MAX_AGE_MS) continue;
      out.set(k, v);
    }
  } catch {
    /* ignore */
  }
  return out;
}

function persistGridCache(map: Map<string, GridCacheEntry>) {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const entries: Record<string, GridCacheEntry> = {};
    for (const [k, v] of map) {
      if (now - v.storedAtMs < GRID_CACHE_MAX_AGE_MS) entries[k] = v;
    }
    localStorage.setItem(GRID_CACHE_LS_KEY, JSON.stringify({ v: 1, entries }));
  } catch {
    /* quota */
  }
}

function getFreshGridData(map: Map<string, GridCacheEntry>, key: string): ApiOk | null {
  const e = map.get(key);
  return e && gridEntryFresh(e) ? e.data : null;
}

function getAnyGridData(map: Map<string, GridCacheEntry>, key: string): ApiOk | null {
  return map.get(key)?.data ?? null;
}

function uniqSortedLeads(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

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

/** Minimum box so one tap opens the popup on touch (fat-finger friendly). */
const MARKER_TOUCH_MIN_PX = 44;

function windArrowIcon(fromDeg: number, speedKn: number): L.DivIcon {
  const rot = flowRotationFromFromDeg(fromDeg);
  const t = clamp(speedKn / 48, 0, 1);
  const h = Math.round(14 + t * 20);
  const w = Math.max(5, Math.round(h * 0.42));
  const color = windColorKn(speedKn);
  const boxW = Math.max(w * 2, MARKER_TOUCH_MIN_PX);
  const boxH = Math.max(h, MARKER_TOUCH_MIN_PX);
  const html = `<div class="sealink-model-wind-hit" style="width:${boxW}px;height:${boxH}px;display:flex;align-items:center;justify-content:center;pointer-events:auto"><div style="width:0;height:0;border-left:${w}px solid transparent;border-right:${w}px solid transparent;border-bottom:${h}px solid ${color};transform:rotate(${rot}deg);transform-origin:50% 72%;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))"></div></div>`;
  return L.divIcon({
    className: "sealink-model-wind-arrow",
    html,
    iconSize: [boxW, boxH],
    iconAnchor: [Math.round(boxW / 2), Math.round(boxH / 2)],
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

function FitBoundsTrigger({
  bounds,
  trigger,
}: {
  bounds: L.LatLngBoundsExpression;
  trigger: number;
}) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [18, 18], maxZoom: 12 });
    map.setZoom(Math.min(map.getZoom() + 3, map.getMaxZoom()));
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
  return null;
}

export function WeatherModelChartViewer() {
  const { isMobile, mounted } = useIsMobileApp();
  const [region, setRegion] = useState<WeatherChartRegionId>("europe");
  const [layer, setLayer] = useState<LayerId>("wind10m");
  const [lead, setLead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fitTick, setFitTick] = useState(0);
  const [data, setData] = useState<ApiOk | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [staleNotice, setStaleNotice] = useState(false);
  const fetchGen = useRef(0);
  const clientGridCache = useRef(new Map<string, GridCacheEntry>());
  const gridCacheHydrated = useRef(false);
  const fetchThrottleUntil = useRef(0);
  const regionLayerBoot = useRef(false);
  const prevRegionLayer = useRef({ region, layer });

  const regionConfig = useMemo(() => getWeatherChartRegion(region), [region]);
  const activeLayer = useMemo(() => LAYERS.find((l) => l.id === layer) ?? LAYERS[0], [layer]);

  useEffect(() => {
    console.info("WEATHER_STEP_CHANGE", { region, layer, lead });
  }, [region, layer, lead]);

  useEffect(() => {
    const gen = ++fetchGen.current;
    const ac = new AbortController();

    const map = clientGridCache.current;
    if (!gridCacheHydrated.current && typeof window !== "undefined") {
      gridCacheHydrated.current = true;
      for (const [k, v] of readPersistedGridCache()) map.set(k, v);
    }

    const regionChanged = prevRegionLayer.current.region !== region;
    const layerChanged = prevRegionLayer.current.layer !== layer;
    const regionLayerChanged = !regionLayerBoot.current || regionChanged || layerChanged;
    regionLayerBoot.current = true;
    if (regionLayerChanged) {
      if (regionChanged) {
        const prefix = `${region}|`;
        for (const k of [...map.keys()]) {
          if (!k.startsWith(prefix)) map.delete(k);
        }
        persistGridCache(map);
      }
      prevRegionLayer.current = { region, layer };
      setData(null);
      setStaleNotice(false);
    }

    const leadsWanted = regionLayerChanged ? uniqSortedLeads([0, 3, 6, lead]) : [lead];
    const missing = leadsWanted.filter((lh) => !getFreshGridData(map, gridCacheKey(region, layer, lh)));

    const applyCurrentFromServerCache = () => {
      const hit = getFreshGridData(map, gridCacheKey(region, layer, lead));
      if (hit && gen === fetchGen.current) {
        setData(hit);
        setStaleNotice(!!hit.stale);
        setLoadErr(null);
      }
    };

    if (missing.length === 0) {
      applyCurrentFromServerCache();
      setLoading(false);
      return () => ac.abort();
    }

    setLoading(true);
    setLoadErr(null);
    if (!regionLayerChanged) {
      applyCurrentFromServerCache();
    }

    (async () => {
      try {
        const waitThrottle = Math.max(0, fetchThrottleUntil.current - Date.now());
        if (waitThrottle > 0) await new Promise((r) => setTimeout(r, waitThrottle));
        if (gen !== fetchGen.current || ac.signal.aborted) return;

        const qs = new URLSearchParams({ region, layer, leads: missing.join(",") });
        let r = await fetch(`/api/weather/model-map-data?${qs.toString()}`, { cache: "no-store", signal: ac.signal });
        if ((r.status === 429 || r.status === 502) && gen === fetchGen.current && !ac.signal.aborted) {
          await new Promise((res) => setTimeout(res, CLIENT_RETRY_DELAY_MS));
          if (gen !== fetchGen.current || ac.signal.aborted) return;
          r = await fetch(`/api/weather/model-map-data?${qs.toString()}`, { cache: "no-store", signal: ac.signal });
        }
        fetchThrottleUntil.current = Date.now() + CLIENT_FETCH_THROTTLE_MS;

        const j = (await r.json()) as ApiOk | ApiBatch | { error?: string };
        if (gen !== fetchGen.current) return;
        if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`);

        const nowMs = Date.now();
        if ("batch" in j && j.batch && Array.isArray((j as ApiBatch).items)) {
          const b = j as ApiBatch;
          const batchStale = !!b.stale;
          for (const item of b.items) {
            if (!item?.ok) continue;
            const data: ApiOk = {
              ...item,
              stale: !!(item.stale || batchStale),
            };
            map.set(gridCacheKey(item.region, item.layer, item.leadHours), { storedAtMs: nowMs, data });
          }
        } else if ("ok" in j && j.ok && !("batch" in j && j.batch)) {
          const one = j as ApiOk;
          map.set(gridCacheKey(one.region, one.layer, one.leadHours), { storedAtMs: nowMs, data: one });
        } else {
          throw new Error((j as { error?: string }).error || "Fetch failed");
        }
        persistGridCache(map);

        const cur = getFreshGridData(map, gridCacheKey(region, layer, lead));
        if (gen !== fetchGen.current) return;
        if (cur) {
          setData(cur);
          setStaleNotice(!!cur.stale);
          setLoadErr(null);
        } else {
          throw new Error("Missing timestep in batch response");
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (gen !== fetchGen.current) return;
        const cur = getAnyGridData(map, gridCacheKey(region, layer, lead));
        if (cur) {
          setData(cur);
          setStaleNotice(!!cur.stale);
          setLoadErr(null);
        } else {
          setLoadErr(e instanceof Error ? e.message : "Could not load forecast grid");
        }
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
      stale: !!data.stale,
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

  const fromClientGrid = getFreshGridData(clientGridCache.current, gridCacheKey(region, layer, lead));
  const mapFrame: ApiOk | null =
    fromClientGrid ??
    (data != null && data.region === region && data.layer === layer && data.leadHours === lead
      ? data
      : data != null && data.region === region && data.layer === layer && loading
        ? data
        : null);

  const showMapLayer = mapFrame != null && mapFrame.region === region && mapFrame.layer === layer;
  const uiMatches = showMapLayer && mapFrame.leadHours === lead;
  const points = mapFrame?.points ?? [];
  const mapFrameLead = mapFrame?.leadHours ?? lead;
  const timestepEmpty = uiMatches && mapFrame.validCount === 0 && !loading;

  // Removed: pressure/precipitation/temperature layers.

  if (mounted && isMobile) {
    return (
      <div className="space-y-4 text-slate-100 text-left animate-fadeIn">
        {/* Layer Selector Tabs */}
        <div className="flex gap-2 bg-[#0a1424]/40 border border-white/[0.05] rounded-2xl p-1.5 shadow-inner">
          {LAYERS.map((l) => {
            const isActive = l.id === layer;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setLayer(l.id)}
                className={`flex-1 h-9 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${isActive
                  ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/30"
                  : "text-slate-400 hover:text-white"
                  }`}
              >
                {l.id === "wind10m" ? <Activity size={13} /> : <Waves size={13} />}
                <span>{l.label} Forecast</span>
              </button>
            );
          })}
        </div>

        {/* Map Frame with Floating Controls */}
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c182c]/40 shadow-2xl h-[380px] sm:h-[420px] w-full min-h-[250px]">
          <MapContainer
            className="h-full w-full [&_.leaflet-tile-pane]:opacity-90 [&_.leaflet-popup-content]:max-w-[200px] [&_.leaflet-popup-content]:!m-0 [&_.leaflet-popup-content]:p-2 [&_.leaflet-popup-content]:text-sm"
            bounds={regionConfig.mapBounds}
            boundsOptions={{ padding: [18, 18], maxZoom: 12 }}
            scrollWheelZoom
            attributionControl={false}
          >
            <AttributionControl position="bottomright" prefix={false} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBoundsTrigger bounds={regionConfig.mapBounds} trigger={fitTick} />

            {showMapLayer && layer === "wind10m"
              ? points.map((p, i) => {
                const sp = p.windSpeedKn;
                const dir = p.windDirFromDeg;
                if (sp == null || dir == null || !Number.isFinite(sp) || !Number.isFinite(dir)) return null;
                return (
                  <Marker
                    key={`w-${mapFrameLead}-${i}-${sp}-${dir}`}
                    position={[p.lat, p.lng]}
                    icon={windArrowIcon(dir, sp)}
                  >
                    <Popup>
                      <div className="text-xs text-zinc-900 font-semibold p-1">
                        <div className="font-extrabold text-cyan-800">10m Wind Speed</div>
                        <div className="text-base font-black mt-0.5">{sp.toFixed(0)} kn</div>
                        <div className="text-[10px] text-zinc-500 font-medium mt-0.5">From {Math.round(dir)}°</div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })
              : null}

            {showMapLayer && layer === "waves"
              ? points.map((p, i) => {
                const h = p.waveHeightM;
                const wd = p.waveDirFromDeg;
                if (h == null || !Number.isFinite(h) || h < 0.05) return null;
                const color = waveHeightColor(h);
                const showDir =
                  wd != null && Number.isFinite(wd) && Number.isFinite(h) && h >= 0.12;
                return (
                  <CircleMarker
                    key={`wh-${mapFrameLead}-${i}-${h}`}
                    center={[p.lat, p.lng]}
                    radius={8 + clamp(h, 0, 4) * 2}
                    pathOptions={{ color: "rgba(255,255,255,0.3)", weight: 1, fillColor: color, fillOpacity: 0.88 }}
                  >
                    <Popup>
                      <div className="text-xs text-zinc-900 font-semibold p-1">
                        <div className="font-extrabold text-blue-800">Wave Height</div>
                        <div className="text-base font-black mt-0.5">{h.toFixed(2)} m</div>
                        {showDir && <div className="text-[10px] text-zinc-500 font-medium mt-0.5">Direction (from) {Math.round(wd!)}°</div>}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })
              : null}

            {showMapLayer && layer === "waves"
              ? points.map((p, i) => {
                const h = p.waveHeightM;
                const wd = p.waveDirFromDeg;
                if (h == null || wd == null || !Number.isFinite(h) || h < 0.12 || !Number.isFinite(wd)) return null;
                return (
                  <Marker
                    key={`wa-${mapFrameLead}-${i}-${h}-${wd}`}
                    position={[p.lat, p.lng]}
                    icon={waveArrowIcon(wd, h)}
                    interactive={false}
                  />
                );
              })
              : null}
          </MapContainer>

          {/* Floating Top-Left Legend Overlay */}
          <div className="absolute top-3 left-3 z-[1000] pointer-events-none w-[130px]">
            <LayerLegend layer={layer} />
          </div>

          {/* Floating Top-Right Region Control */}
          <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2 pointer-events-auto">
            <select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value as WeatherChartRegionId);
                setFitTick((n) => n + 1);
              }}
              className="rounded-xl border border-white/[0.08] bg-[#0c192c]/90 px-3 py-2 text-xs font-bold text-slate-200 outline-none shadow-lg backdrop-blur-md"
            >
              {WEATHER_CHART_REGIONS.map((r) => (
                <option key={r.id} value={r.id} className="bg-zinc-950 text-white">
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setFitTick((n) => n + 1)}
              className="flex h-8 items-center justify-center rounded-xl border border-white/[0.08] bg-[#0c192c]/90 text-[10px] font-bold text-zinc-300 active:scale-95 transition-all shadow-lg backdrop-blur-md px-2"
            >
              Fit region
            </button>
          </div>

          {/* Loading Indicator Overlay */}
          {loading && (
            <div className="absolute inset-0 z-[1100] flex flex-col items-center justify-center gap-1.5 bg-black/40 text-xs font-semibold text-white pointer-events-none backdrop-blur-[1px]">
              <div className="h-5 w-5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
              <span>Loading +{lead}h forecast…</span>
            </div>
          )}
        </div>

        {/* Floating/Overlay Bottom Controls Card */}
        <div className="rounded-3xl border border-white/[0.06] bg-[#0c192c]/45 p-4 space-y-3.5 shadow-md">
          {/* Header Info details */}
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] pb-2">
            <div>
              <p className="text-[11px] font-extrabold text-slate-100 tracking-wide">
                {activeLayer.label} Forecast
              </p>
              {uiMatches && mapFrame?.timeIso ? (
                <p className="text-[9px] font-mono text-zinc-400 mt-0.5">
                  +{lead}h · {new Date(mapFrame.timeIso).toLocaleString("en-GB", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              ) : (
                <p className="text-[9px] font-mono text-zinc-400 mt-0.5">
                  +{lead}h timestep
                </p>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className={`h-8 px-3 rounded-lg text-xs font-bold transition-all active:scale-95 ${playing ? "bg-amber-600 text-white" : "bg-emerald-600 text-white"
                  }`}
              >
                {playing ? "Pause" : "Play Loop"}
              </button>
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={lead <= 0}
                className="h-8 w-8 rounded-lg border border-white/10 bg-white/[0.03] text-zinc-300 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all flex items-center justify-center font-bold text-xs"
              >
                −3h
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={lead >= MAX_LEAD_H}
                className="h-8 w-8 rounded-lg border border-white/10 bg-white/[0.03] text-zinc-300 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all flex items-center justify-center font-bold text-xs"
              >
                +3h
              </button>
            </div>
          </div>

          {/* Timeline Range Slider */}
          <div className="space-y-1">
            <input
              type="range"
              min={0}
              max={Math.max(0, HOURS.length - 1)}
              value={leadIndex}
              onChange={(e) => setLead(HOURS[Number(e.target.value)] ?? 0)}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex justify-between text-[8px] font-bold font-mono text-zinc-500">
              <span>+0h (Now)</span>
              <span>+{HOURS[Math.floor(HOURS.length / 2)]}h</span>
              <span>+{MAX_LEAD_H}h (Limit)</span>
            </div>
          </div>

          {/* Status notices */}
          {loadErr && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-[10px] text-red-400">
              {loadErr}
            </p>
          )}
          {staleNotice && !loadErr && (
            <p className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-[10px] text-sky-300 leading-normal">
              Using cached GFS forecast data.
            </p>
          )}
          {timestepEmpty && (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-400 leading-normal">
              No GFS data at +{lead}h for this region.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Model chart viewer</h2>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            OpenStreetMap + Open‑Meteo (GFS / marine). Grids are cached up to 6h (browser + server); the page checks that cache
            before requesting. One server fetch covers all timesteps per region/layer. +0h/+3h/+6h preload when you change region
            or layer; other hours load when you move the timeline.
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
            {uiMatches && mapFrame?.timeIso ? (
              <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                Step: +{lead}h · {mapFrame.timeIso} · {mapFrame.validCount} points
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

      {staleNotice && !loadErr ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/50 dark:text-sky-100">
          Using cached data — forecast service was rate-limited or temporarily unavailable; showing the last good grid for this
          region and layer.
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
          className="sealink-model-chart-map h-[min(72vh,760px)] w-full"
          bounds={regionConfig.mapBounds}
          boundsOptions={{ padding: [18, 18], maxZoom: 12 }}
          scrollWheelZoom
          attributionControl={false}
        >
          <AttributionControl position="bottomright" prefix={false} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBoundsTrigger bounds={regionConfig.mapBounds} trigger={fitTick} />

          {showMapLayer && layer === "wind10m"
            ? points.map((p, i) => {
              const sp = p.windSpeedKn;
              const dir = p.windDirFromDeg;
              if (sp == null || dir == null || !Number.isFinite(sp) || !Number.isFinite(dir)) return null;
              return (
                <Marker
                  key={`w-${mapFrameLead}-${i}-${sp}-${dir}`}
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

          {showMapLayer && layer === "waves"
            ? points.map((p, i) => {
              const h = p.waveHeightM;
              const wd = p.waveDirFromDeg;
              if (h == null || !Number.isFinite(h) || h < 0.05) return null;
              const color = waveHeightColor(h);
              const showDir =
                wd != null && Number.isFinite(wd) && Number.isFinite(h) && h >= 0.12;
              return (
                <CircleMarker
                  key={`wh-${mapFrameLead}-${i}-${h}`}
                  center={[p.lat, p.lng]}
                  radius={9 + clamp(h, 0, 4) * 2.2}
                  pathOptions={{ color: "rgba(255,255,255,0.35)", weight: 1, fillColor: color, fillOpacity: 0.88 }}
                >
                  <Popup>
                    <div className="text-xs">
                      <div className="font-semibold">Waves</div>
                      <div>{h.toFixed(2)} m</div>
                      {showDir ? <div className="text-zinc-500">Direction (from) {Math.round(wd!)}°</div> : null}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })
            : null}

          {showMapLayer && layer === "waves"
            ? points.map((p, i) => {
              const h = p.waveHeightM;
              const wd = p.waveDirFromDeg;
              if (h == null || wd == null || !Number.isFinite(h) || h < 0.12 || !Number.isFinite(wd)) return null;
              return (
                <Marker
                  key={`wa-${mapFrameLead}-${i}-${h}-${wd}`}
                  position={[p.lat, p.lng]}
                  icon={waveArrowIcon(wd, h)}
                  interactive={false}
                />
              );
            })
            : null}

          {/* Removed: pressure/precipitation/temperature overlays */}
        </MapContainer>
      </div>

      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
        Arrows use meteorological “from” directions from the API and are drawn <strong>downwind</strong> (wind) or <strong>along propagation</strong> (waves).
      </p>
    </section>
  );
}
