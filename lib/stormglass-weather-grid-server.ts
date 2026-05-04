/**
 * Server-only helpers for Stormglass `/v2/weather/point` sampling used by the weather map grid API.
 */

export const STORMGLASS_GRID_CACHE_TTL_MS = 60 * 60 * 1000;
/** One request per point: wind, waves, and swell together (not separate calls per variable). */
export const STORMGLASS_COMBINED_WEATHER_PARAMS =
  "windSpeed,windDirection,waveHeight,swellHeight,swellPeriod,swellDirection";

export function pickStormglassNumeric(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && Number.isFinite(Number(v))) return Number(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.sg === "number" && Number.isFinite(o.sg)) return o.sg;
    if (typeof o.sg === "string" && Number.isFinite(Number(o.sg))) return Number(o.sg);
    for (const x of Object.values(o)) {
      if (typeof x === "number" && Number.isFinite(x)) return x;
      if (typeof x === "string" && Number.isFinite(Number(x))) return Number(x);
    }
  }
  return null;
}

export function nearestHourIndex(times: string[], timeIso: string): number {
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
  return idx;
}

type HourRowResult = {
  row: Record<string, unknown> | null;
  httpStatus: number;
};

/**
 * Single Stormglass weather/point request for the given params bundle.
 * On 429, does not retry alternate `source` (counts as quota hit).
 */
export async function fetchStormglassHourRow(
  apiKey: string,
  lat: number,
  lng: number,
  timeIso: string,
  params: string,
  signal?: AbortSignal,
): Promise<HourRowResult> {
  const start = new Date(timeIso);
  const end = new Date(start.getTime() + 36 * 60 * 60 * 1000);
  let lastStatus = 0;

  for (const useSgSource of [true, false]) {
    const url = new URL("https://api.stormglass.io/v2/weather/point");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lng", String(lng));
    url.searchParams.set("params", params);
    url.searchParams.set("start", start.toISOString());
    url.searchParams.set("end", end.toISOString());
    if (useSgSource) url.searchParams.set("source", "sg");

    const r = await fetch(url.toString(), {
      headers: { Authorization: apiKey },
      cache: "no-store",
      signal,
    });
    lastStatus = r.status;
    if (r.status === 429) {
      return { row: null, httpStatus: 429 };
    }
    if (!r.ok) continue;
    const j = (await r.json()) as {
      hours?: { time: string; [k: string]: unknown }[];
      data?: { time: string; [k: string]: unknown }[];
    };
    const hours = j.hours ?? j.data;
    if (!Array.isArray(hours) || hours.length === 0) continue;
    const times = hours.map((h) => h.time);
    const i = nearestHourIndex(times, timeIso);
    return { row: hours[i] ?? null, httpStatus: 200 };
  }
  return { row: null, httpStatus: lastStatus };
}

type CachedHour = { storedAt: number; row: Record<string, unknown> | null };
const hourRowCache = new Map<string, CachedHour>();
const MAX_CACHE_ENTRIES = 800;

function cacheKey(lat: number, lng: number, timeIso: string, params: string): string {
  return `${lat.toFixed(4)}|${lng.toFixed(4)}|${timeIso}|${params}`;
}

function pruneStormglassCache(): void {
  if (hourRowCache.size <= MAX_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of hourRowCache) {
    if (now - v.storedAt > STORMGLASS_GRID_CACHE_TTL_MS) hourRowCache.delete(k);
  }
  if (hourRowCache.size <= MAX_CACHE_ENTRIES) return;
  const keys = [...hourRowCache.keys()].slice(0, Math.max(0, hourRowCache.size - MAX_CACHE_ENTRIES + 100));
  for (const k of keys) hourRowCache.delete(k);
}

export type StormglassCachedFetchMeta = {
  fromCache: boolean;
  httpStatus: number;
};

/**
 * In-memory cache (per server instance) for Stormglass hour rows — at least 60 minutes.
 */
export async function fetchStormglassHourRowCached(
  apiKey: string,
  lat: number,
  lng: number,
  timeIso: string,
  params: string,
  signal: AbortSignal | undefined,
  opts: { forceRefresh?: boolean },
): Promise<{ row: Record<string, unknown> | null; meta: StormglassCachedFetchMeta }> {
  const key = cacheKey(lat, lng, timeIso, params);
  if (!opts.forceRefresh) {
    const hit = hourRowCache.get(key);
    if (hit && Date.now() - hit.storedAt < STORMGLASS_GRID_CACHE_TTL_MS) {
      console.info("[Stormglass] grid hour row CACHE hit", {
        lat: Number(lat.toFixed(4)),
        lng: Number(lng.toFixed(4)),
        timeIso: timeIso.slice(0, 19),
        params: params.slice(0, 48),
      });
      return { row: hit.row, meta: { fromCache: true, httpStatus: 200 } };
    }
  }

  const { row, httpStatus } = await fetchStormglassHourRow(apiKey, lat, lng, timeIso, params, signal);
  if (httpStatus === 200 || (row == null && httpStatus !== 429)) {
    hourRowCache.set(key, { storedAt: Date.now(), row });
    pruneStormglassCache();
  }

  console.info("[Stormglass] grid hour row NETWORK", {
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
    timeIso: timeIso.slice(0, 19),
    params: params.slice(0, 48),
    httpStatus,
    forceRefresh: Boolean(opts.forceRefresh),
  });

  return { row, meta: { fromCache: false, httpStatus } };
}
