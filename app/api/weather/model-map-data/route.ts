import { NextResponse } from "next/server";
import { buildRegionGridCapped, getWeatherChartRegion, type WeatherChartRegionId } from "@/lib/weather/model-chart-regions";

export const runtime = "nodejs";

/** Series cache: reuse Open‑Meteo fetch for up to 6h (then refresh on next request). */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_LEAD_H = 117;

/** One upstream request covers all timesteps; cap hourly length. */
const SERIES_FORECAST_HOURS = 120;

const RETRY_DELAY_MS = 7000;

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

export type ModelMapResponse = {
  ok: true;
  region: WeatherChartRegionId;
  layer: ModelMapLayerId;
  leadHours: number;
  timeIso: string | null;
  validCount: number;
  points: ModelMapPoint[];
  fetchedAtIso: string;
  stale?: boolean;
};

type ModelMapBatchResponse = {
  ok: true;
  batch: true;
  region: WeatherChartRegionId;
  layer: ModelMapLayerId;
  stale?: boolean;
  items: ModelMapResponse[];
};

type SeriesData = {
  region: WeatherChartRegionId;
  layer: ModelMapLayerId;
  pts: { lat: number; lon: number }[];
  gfsLocs: OmLoc[];
  marineLocs: OmLoc[];
  timeArr: string[];
};

type SeriesCacheEntry = { storedAtMs: number; series: SeriesData };

const seriesCache = new Map<string, SeriesCacheEntry>();
const seriesInflight = new Map<string, Promise<{ series: SeriesData; stale: boolean }>>();

function seriesKey(region: WeatherChartRegionId, layer: ModelMapLayerId): string {
  return `${region}|${layer}`;
}

function parseLayer(s: string | null): ModelMapLayerId {
  const v = (s ?? "wind10m").toLowerCase();
  return (LAYERS as string[]).includes(v) ? (v as ModelMapLayerId) : "wind10m";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function fetchOpenMeteo(url: string, signal?: AbortSignal): Promise<Response> {
  let res = await fetch(url, { cache: "no-store", signal });
  if (res.status === 429) {
    console.warn("WEATHER_RATE_LIMIT", { url: url.slice(0, 140), phase: "initial" });
    try {
      await sleep(RETRY_DELAY_MS, signal);
    } catch {
      return res;
    }
    res = await fetch(url, { cache: "no-store", signal });
    if (res.status === 429) {
      console.warn("WEATHER_RATE_LIMIT", { url: url.slice(0, 140), phase: "after_retry" });
    }
  }
  return res;
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
  const res = await fetchOpenMeteo(url.toString(), signal);
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
  const res = await fetchOpenMeteo(url.toString(), signal);
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

async function loadSeriesFromOpenMeteo(
  region: WeatherChartRegionId,
  layer: ModelMapLayerId,
  signal?: AbortSignal,
): Promise<SeriesData> {
  const r = getWeatherChartRegion(region);
  const { points: pts } = buildRegionGridCapped(r);

  let gfsLocs: OmLoc[] = [];
  let marineLocs: OmLoc[] = [];

  if (layer === "waves") {
    marineLocs = await fetchMarineGrid(pts, SERIES_FORECAST_HOURS, signal);
  } else if (layer === "wind10m") {
    gfsLocs = await fetchGfsGrid(pts, "windspeed_10m,winddirection_10m", SERIES_FORECAST_HOURS, signal);
  } else if (layer === "pressure_msl") {
    gfsLocs = await fetchGfsGrid(pts, "pressure_msl", SERIES_FORECAST_HOURS, signal);
  } else if (layer === "precipitation") {
    gfsLocs = await fetchGfsGrid(pts, "precipitation", SERIES_FORECAST_HOURS, signal);
  } else {
    gfsLocs = await fetchGfsGrid(pts, "temperature_2m", SERIES_FORECAST_HOURS, signal);
  }

  const primary = layer === "waves" ? marineLocs[0] : gfsLocs[0];
  const timeArr = primary?.hourly?.time ?? [];
  if (timeArr.length === 0) throw new Error("No hourly timeline from upstream");

  return {
    region,
    layer,
    pts,
    gfsLocs,
    marineLocs,
    timeArr,
  };
}

function buildModelResponse(
  series: SeriesData,
  leadHours: number,
  fetchedAtIso: string,
  stale: boolean,
): ModelMapResponse {
  const { layer, timeArr, pts, gfsLocs, marineLocs } = series;
  const timeLen = timeArr.length;
  if (leadHours < 0 || leadHours > MAX_LEAD_H || leadHours % 3 !== 0) {
    throw new Error(`Invalid lead ${leadHours}`);
  }
  if (leadHours >= timeLen) {
    throw new Error(`Timestep +${leadHours}h not available (series length ${timeLen})`);
  }
  const idxTime = leadHours;
  const timeIso = timeArr[idxTime] ?? null;

  const n = layer === "waves" ? Math.min(pts.length, marineLocs.length) : Math.min(pts.length, gfsLocs.length);

  const points: ModelMapPoint[] = [];
  let validCount = 0;

  for (let i = 0; i < n; i++) {
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

  return {
    ok: true,
    region: series.region,
    layer,
    leadHours,
    timeIso,
    validCount,
    points,
    fetchedAtIso,
    ...(stale ? { stale: true } : {}),
  };
}

async function getSeriesWithCache(
  region: WeatherChartRegionId,
  layer: ModelMapLayerId,
  signal?: AbortSignal,
): Promise<{ series: SeriesData; stale: boolean }> {
  const key = seriesKey(region, layer);

  const hit = seriesCache.get(key);
  if (hit && Date.now() - hit.storedAtMs < CACHE_TTL_MS) {
    console.info("WEATHER_CACHE_HIT", { region, layer, kind: "series_fresh" });
    return { series: hit.series, stale: false };
  }

  const existing = seriesInflight.get(key);
  if (existing) {
    console.info("WEATHER_CACHE_HIT", { region, layer, kind: "series_inflight" });
    return existing;
  }

  const p = (async (): Promise<{ series: SeriesData; stale: boolean }> => {
    console.info("WEATHER_API_CALL", { region, layer });
    try {
      const series = await loadSeriesFromOpenMeteo(region, layer, signal);
      seriesCache.set(key, { storedAtMs: Date.now(), series });
      return { series, stale: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const prev = seriesCache.get(key);
      if (prev) {
        console.info("WEATHER_CACHE_HIT", { region, layer, kind: "stale_fallback", error: msg });
        return { series: prev.series, stale: true };
      }
      throw e;
    } finally {
      seriesInflight.delete(key);
    }
  })();

  seriesInflight.set(key, p);
  return p;
}

function parseLeadsList(url: URL): number[] {
  const leadsRaw = url.searchParams.get("leads");
  const leadSingle = url.searchParams.get("lead");

  if (leadsRaw != null && leadsRaw.trim() !== "") {
    const parts = leadsRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const set = new Set<number>();
    for (const p of parts) {
      const n = Number(p);
      if (!Number.isFinite(n) || n < 0 || n > MAX_LEAD_H || n % 3 !== 0) {
        throw new Error(`Invalid lead in leads: ${p} (expect 0–${MAX_LEAD_H} step 3)`);
      }
      set.add(n);
    }
    if (set.size === 0) throw new Error("leads is empty");
    return [...set].sort((a, b) => a - b);
  }

  const n = Number(leadSingle ?? "0");
  if (!Number.isFinite(n) || n < 0 || n > MAX_LEAD_H || n % 3 !== 0) {
    throw new Error(`lead must be 0–${MAX_LEAD_H} in steps of 3`);
  }
  return [n];
}

const jsonHeaders = (extra: Record<string, string>) => ({
  "Cache-Control": "public, max-age=180, s-maxage=300",
  ...extra,
});

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const regionRaw = (url.searchParams.get("region") ?? "europe").toLowerCase() as WeatherChartRegionId;
  const layer = parseLayer(url.searchParams.get("layer"));

  let region: WeatherChartRegionId;
  try {
    getWeatherChartRegion(regionRaw);
    region = regionRaw;
  } catch {
    return NextResponse.json({ error: "Invalid region" }, { status: 400 });
  }

  let leads: number[];
  try {
    leads = parseLeadsList(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid leads";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const { series, stale } = await getSeriesWithCache(region, layer, req.signal);
    const fetchedAtIso = new Date().toISOString();
    const batch = leads.length > 1;

    if (batch) {
      const items = leads.map((lh) => buildModelResponse(series, lh, fetchedAtIso, stale));
      const body: ModelMapBatchResponse = {
        ok: true,
        batch: true,
        region,
        layer,
        ...(stale ? { stale: true } : {}),
        items,
      };
      return NextResponse.json(body, {
        headers: jsonHeaders({
          "X-Sealink-Model-Map-Cache": stale ? "STALE" : "MISS",
          ...(stale ? { "X-Sealink-Weather-Stale": "1" } : {}),
        }),
      });
    }

    const one = buildModelResponse(series, leads[0]!, fetchedAtIso, stale);
    return NextResponse.json(one, {
      headers: jsonHeaders({
        "X-Sealink-Model-Map-Cache": stale ? "STALE" : "MISS",
        ...(stale ? { "X-Sealink-Weather-Stale": "1" } : {}),
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upstream weather data unavailable";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
