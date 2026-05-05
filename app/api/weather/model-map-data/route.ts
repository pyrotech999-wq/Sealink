import { NextResponse } from "next/server";
import { buildRegionGridCapped, getWeatherChartRegion, type WeatherChartRegionId } from "@/lib/weather/model-chart-regions";

export const runtime = "nodejs";

const CACHE_TTL_MS = 25 * 60 * 1000;
const MAX_LEAD_H = 117;

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
  /** Meteorological: direction wind comes FROM (degrees). */
  windDirFromDeg?: number | null;
  pressureHpa?: number | null;
  precipMm?: number | null;
  tempC?: number | null;
  waveHeightM?: number | null;
  /** Meteorological: direction waves come FROM (degrees), when available. */
  waveDirFromDeg?: number | null;
};

type CacheEntry = { storedAtMs: number; value: ModelMapResponse };

type ModelMapResponse = {
  ok: true;
  region: WeatherChartRegionId;
  leadHours: number;
  timeIso: string | null;
  points: ModelMapPoint[];
  fetchedAtIso: string;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ModelMapResponse>>();

function cacheKey(region: WeatherChartRegionId, leadHours: number): string {
  return `${region}|${leadHours}`;
}

function clampInt(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

async function fetchGfsGrid(
  pts: { lat: number; lon: number }[],
  signal?: AbortSignal,
): Promise<OmLoc[]> {
  const url = new URL("https://api.open-meteo.com/v1/gfs");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("forecast_days", "5");
  url.searchParams.set("wind_speed_unit", "kn");
  url.searchParams.set("hourly", "windspeed_10m,winddirection_10m,pressure_msl,precipitation,temperature_2m");
  url.searchParams.set("latitude", pts.map((p) => p.lat.toFixed(4)).join(","));
  url.searchParams.set("longitude", pts.map((p) => p.lon.toFixed(4)).join(","));
  const res = await fetch(url.toString(), { cache: "no-store", signal });
  if (!res.ok) throw new Error(`Open-Meteo GFS ${res.status}`);
  const j = (await res.json()) as OmLoc | OmLoc[];
  return Array.isArray(j) ? j : [j];
}

async function fetchMarineGrid(
  pts: { lat: number; lon: number }[],
  signal?: AbortSignal,
): Promise<OmLoc[]> {
  const url = new URL("https://marine-api.open-meteo.com/v1/marine");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("forecast_days", "5");
  url.searchParams.set("hourly", "wave_height,wave_direction");
  url.searchParams.set("latitude", pts.map((p) => p.lat.toFixed(4)).join(","));
  url.searchParams.set("longitude", pts.map((p) => p.lon.toFixed(4)).join(","));
  const res = await fetch(url.toString(), { cache: "no-store", signal });
  if (!res.ok) throw new Error(`Open-Meteo Marine ${res.status}`);
  const j = (await res.json()) as OmLoc | OmLoc[];
  return Array.isArray(j) ? j : [j];
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const regionRaw = (url.searchParams.get("region") ?? "europe").toLowerCase() as WeatherChartRegionId;
  const leadRaw = Number(url.searchParams.get("lead") ?? "0");

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

  const key = cacheKey(region, leadHours);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.storedAtMs < CACHE_TTL_MS) {
    return NextResponse.json(hit.value, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=600", "X-Sealink-Model-Map-Cache": "HIT" },
    });
  }

  const existing = inflight.get(key);
  if (existing) {
    const v = await existing;
    return NextResponse.json(v, { headers: { "X-Sealink-Model-Map-Cache": "HIT-INFLIGHT" } });
  }

  const p = (async (): Promise<ModelMapResponse> => {
    const r = getWeatherChartRegion(region);
    const { points: pts } = buildRegionGridCapped(r);

    const [gfsLocs, marineLocs] = await Promise.all([
      fetchGfsGrid(pts, req.signal),
      fetchMarineGrid(pts, req.signal),
    ]);

    const n = Math.min(pts.length, gfsLocs.length, marineLocs.length);
    const idxTime = clampInt(leadHours, 0, (gfsLocs[0]?.hourly?.time?.length ?? 1) - 1);
    const timeIso = gfsLocs[0]?.hourly?.time?.[idxTime] ?? null;

    const points: ModelMapPoint[] = [];
    for (let i = 0; i < n; i++) {
      const g = gfsLocs[i]!;
      const m = marineLocs[i]!;
      points.push({
        lat: g.latitude,
        lng: g.longitude,
        windSpeedKn: g.hourly?.windspeed_10m?.[idxTime] ?? null,
        windDirFromDeg: g.hourly?.winddirection_10m?.[idxTime] ?? null,
        pressureHpa: g.hourly?.pressure_msl?.[idxTime] ?? null,
        precipMm: g.hourly?.precipitation?.[idxTime] ?? null,
        tempC: g.hourly?.temperature_2m?.[idxTime] ?? null,
        waveHeightM: m.hourly?.wave_height?.[idxTime] ?? null,
        waveDirFromDeg: m.hourly?.wave_direction?.[idxTime] ?? null,
      });
    }

    const value: ModelMapResponse = {
      ok: true,
      region,
      leadHours,
      timeIso,
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
      headers: { "Cache-Control": "public, max-age=300, s-maxage=600", "X-Sealink-Model-Map-Cache": "MISS" },
    });
  } catch {
    return NextResponse.json({ error: "Upstream weather data unavailable" }, { status: 502 });
  }
}
