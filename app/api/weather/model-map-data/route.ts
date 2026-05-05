import { NextResponse } from "next/server";
import { buildRegionGridCapped, getWeatherChartRegion, type WeatherChartRegionId } from "@/lib/weather/model-chart-regions";

export const runtime = "nodejs";

/** 10–15 min target (middle). */
const CACHE_TTL_MS = 12 * 60 * 1000;
const MAX_LEAD_H = 117;

export type ModelMapLayerId = "wind10m" | "waves" | "pressure_msl" | "precipitation" | "temperature_2m";

const LAYERS: ModelMapLayerId[] = ["wind10m", "waves", "pressure_msl", "precipitation", "temperature_2m"];

type OmHourly = {
  time?: string[];
  windspeed_10m?: number[];
  winddirection_10m?: number[];
  pressure_msl?: number[];
  precipitation?: number[];
  temperature_2m?: number[];
  wave_height?: number[];
  wave_direction?: number[];
};

type OmLoc = {
  latitude: number;
  longitude: number;
  hourly?: OmHourly;
};

type ModelMapPoint = {
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

type ModelMapResponse = {
  ok: true;
  region: WeatherChartRegionId;
  layer: ModelMapLayerId;
  leadHours: number;
  timeIso: string | null;
  validCount: number;
  points: ModelMapPoint[];
  fetchedAtIso: string;
};

type CacheEntry = { storedAtMs: number; value: ModelMapResponse };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ModelMapResponse>>();

function cacheKey(region: WeatherChartRegionId, layer: ModelMapLayerId, leadHours: number): string {
  return `${region}|${layer}|${leadHours}`;
}

function parseLayer(s: string | null): ModelMapLayerId {
  const v = (s ?? "wind10m").toLowerCase();
  return (LAYERS as string[]).includes(v) ? (v as ModelMapLayerId) : "wind10m";
}

/** Only request enough hourly steps for the selected lead (+ small buffer); cap at 120h (5-day hourly). */
function forecastHoursForLead(leadHours: number): number {
  return Math.max(24, Math.min(leadHours + 12, 120));
}

async function fetchGfsGrid(
  pts: { lat: number; lon: number }[],
  hourly: string,
  forecastHours: number,
  signal?: AbortSignal,
): Promise<OmLoc[]> {
  const url = new URL("https://api.open-meteo.com/v1/gfs");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("forecast_hours", String(forecastHours));
  url.searchParams.set("wind_speed_unit", "kn");
  url.searchParams.set("hourly", hourly);
  url.searchParams.set("latitude", pts.map((p) => p.lat.toFixed(4)).join(","));
  url.searchParams.set("longitude", pts.map((p) => p.lon.toFixed(4)).join(","));
  const res = await fetch(url.toString(), { cache: "no-store", signal });
  if (!res.ok) throw new Error(`Open-Meteo GFS ${res.status}`);
  const j = (await res.json()) as OmLoc | OmLoc[];
  return Array.isArray(j) ? j : [j];
}

async function fetchMarineGrid(
  pts: { lat: number; lon: number }[],
  forecastHours: number,
  signal?: AbortSignal,
): Promise<OmLoc[]> {
  const url = new URL("https://marine-api.open-meteo.com/v1/marine");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("forecast_hours", String(forecastHours));
  url.searchParams.set("hourly", "wave_height,wave_direction");
  url.searchParams.set("latitude", pts.map((p) => p.lat.toFixed(4)).join(","));
  url.searchParams.set("longitude", pts.map((p) => p.lon.toFixed(4)).join(","));
  const res = await fetch(url.toString(), { cache: "no-store", signal });
  if (!res.ok) throw new Error(`Open-Meteo Marine ${res.status}`);
  const j = (await res.json()) as OmLoc | OmLoc[];
  return Array.isArray(j) ? j : [j];
}

function countValidForLayer(layer: ModelMapLayerId, p: ModelMapPoint): boolean {
  switch (layer) {
    case "wind10m":
      return (
        p.windSpeedKn != null &&
        p.windDirFromDeg != null &&
        Number.isFinite(p.windSpeedKn) &&
        Number.isFinite(p.windDirFromDeg)
      );
    case "waves":
      return p.waveHeightM != null && Number.isFinite(p.waveHeightM) && p.waveHeightM >= 0.05;
    case "pressure_msl":
      return p.pressureHpa != null && Number.isFinite(p.pressureHpa);
    case "precipitation":
      return p.precipMm != null && Number.isFinite(p.precipMm);
    case "temperature_2m":
      return p.tempC != null && Number.isFinite(p.tempC);
    default: {
      const _e: never = layer;
      return _e;
    }
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const regionRaw = (url.searchParams.get("region") ?? "europe").toLowerCase() as WeatherChartRegionId;
  const leadRaw = Number(url.searchParams.get("lead") ?? "0");
  const layer = parseLayer(url.searchParams.get("layer"));

  let region: WeatherChartRegionId;
  try {
    getWeatherChartRegion(regionRaw);
    region = regionRaw;
  } catch {
    return NextResponse.json({ error: "Invalid region" }, { status: 400 });
  }

  if (!Number.isFinite(leadRaw) || leadRaw < 0 || leadRaw > MAX_LEAD_H || leadRaw % 3 !== 0) {
    return NextResponse.json({ error: `lead must be 0–${MAX_LEAD_H} in steps of 3` }, { status: 400 });
  }
  const leadHours = leadRaw;

  const key = cacheKey(region, layer, leadHours);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.storedAtMs < CACHE_TTL_MS) {
    console.info("WEATHER_GRID_CACHE_HIT", { region, layer, leadHours });
    return NextResponse.json(hit.value, {
      headers: { "Cache-Control": "public, max-age=180, s-maxage=300", "X-Sealink-Model-Map-Cache": "HIT" },
    });
  }

  const existing = inflight.get(key);
  if (existing) {
    const v = await existing;
    return NextResponse.json(v, { headers: { "X-Sealink-Model-Map-Cache": "HIT-INFLIGHT" } });
  }

  const fh = forecastHoursForLead(leadHours);

  const p = (async (): Promise<ModelMapResponse> => {
    console.info("WEATHER_GRID_FETCH", { region, layer, leadHours, forecastHours: fh });
    const r = getWeatherChartRegion(region);
    const { points: pts } = buildRegionGridCapped(r);

    let gfsLocs: OmLoc[] = [];
    let marineLocs: OmLoc[] = [];

    if (layer === "waves") {
      marineLocs = await fetchMarineGrid(pts, fh, req.signal);
    } else if (layer === "wind10m") {
      gfsLocs = await fetchGfsGrid(pts, "windspeed_10m,winddirection_10m", fh, req.signal);
    } else if (layer === "pressure_msl") {
      gfsLocs = await fetchGfsGrid(pts, "pressure_msl", fh, req.signal);
    } else if (layer === "precipitation") {
      gfsLocs = await fetchGfsGrid(pts, "precipitation", fh, req.signal);
    } else {
      gfsLocs = await fetchGfsGrid(pts, "temperature_2m", fh, req.signal);
    }

    const primary = layer === "waves" ? marineLocs[0] : gfsLocs[0];
    const timeArr = primary?.hourly?.time ?? [];
    const timeLen = timeArr.length;
    if (timeLen === 0) throw new Error("No hourly timeline from upstream");

    if (leadHours >= timeLen) {
      throw new Error(`Timestep +${leadHours}h not available (series length ${timeLen})`);
    }
    const idxTime = leadHours;
    const timeIso = timeArr[idxTime] ?? null;

    const n = layer === "waves" ? Math.min(pts.length, marineLocs.length) : Math.min(pts.length, gfsLocs.length);

    const points: ModelMapPoint[] = [];
    let validCount = 0;

    for (let i = 0; i < n; i++) {
      const baseLat = pts[i]!.lat;
      const baseLng = pts[i]!.lon;

      if (layer === "waves") {
        const m = marineLocs[i]!;
        const pt: ModelMapPoint = {
          lat: m.latitude,
          lng: m.longitude,
          waveHeightM: m.hourly?.wave_height?.[idxTime] ?? null,
          waveDirFromDeg: m.hourly?.wave_direction?.[idxTime] ?? null,
        };
        if (countValidForLayer(layer, pt)) validCount++;
        points.push(pt);
      } else {
        const g = gfsLocs[i]!;
        const pt: ModelMapPoint = {
          lat: g.latitude,
          lng: g.longitude,
          windSpeedKn: g.hourly?.windspeed_10m?.[idxTime] ?? null,
          windDirFromDeg: g.hourly?.winddirection_10m?.[idxTime] ?? null,
          pressureHpa: g.hourly?.pressure_msl?.[idxTime] ?? null,
          precipMm: g.hourly?.precipitation?.[idxTime] ?? null,
          tempC: g.hourly?.temperature_2m?.[idxTime] ?? null,
        };
        if (countValidForLayer(layer, pt)) validCount++;
        points.push(pt);
      }
    }

    const value: ModelMapResponse = {
      ok: true,
      region,
      layer,
      leadHours,
      timeIso,
      validCount,
      points,
      fetchedAtIso: new Date().toISOString(),
    };
    cache.set(key, { storedAtMs: Date.now(), value });
    return value;
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);

  try {
    const v = await p;
    return NextResponse.json(v, {
      headers: { "Cache-Control": "public, max-age=180, s-maxage=300", "X-Sealink-Model-Map-Cache": "MISS" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upstream weather data unavailable";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
