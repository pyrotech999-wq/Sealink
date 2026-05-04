import type { TideTableEvent } from "@/lib/tide-table-types";
import { logStormglassRequest } from "@/lib/stormglass-log";

export type StormglassTideTable = {
  source: "stormglass";
  stationName: string;
  distanceKm: number | null;
  datum: string;
  events: TideTableEvent[];
};

const TIDE_LOG_FILE = "lib/stormglass-tide.ts";
const TIDE_CACHE_TTL_MS = 60 * 60 * 1000;

function fmt(d: Date) {
  return d.toISOString().slice(0, 13);
}

function tideCacheKey(lat: number, lng: number, start: Date, end: Date): string {
  return `${lat.toFixed(4)}|${lng.toFixed(4)}|${fmt(start)}|${fmt(end)}`;
}

type CachedTide = { storedAt: number; value: StormglassTideTable | null };
const tideExtremesCache = new Map<string, CachedTide>();
const tideInflight = new Map<string, Promise<StormglassTideTable | null>>();

/** True if tide extremes are served from RAM cache without a new upstream call. */
export function peekStormglassTideExtremesCache(
  lat: number,
  lng: number,
  start: Date,
  end: Date,
): boolean {
  const key = tideCacheKey(lat, lng, start, end);
  const hit = tideExtremesCache.get(key);
  return Boolean(hit && Date.now() - hit.storedAt < TIDE_CACHE_TTL_MS);
}

export type StormglassTideFetchMeta = "memory" | "network" | "deduped";

/**
 * Stormglass tide extremes (global). Requires STORMGLASS_API_KEY.
 * Prefer `fetchStormglassTideExtremesCached` in routes to avoid duplicate upstream traffic.
 */
export async function fetchStormglassTideExtremes(
  lat: number,
  lng: number,
  start: Date,
  end: Date,
  signal?: AbortSignal,
): Promise<StormglassTideTable | null> {
  const r = await fetchStormglassTideExtremesCached(lat, lng, start, end, signal);
  return r.table;
}

async function fetchStormglassTideExtremesNetwork(
  lat: number,
  lng: number,
  start: Date,
  end: Date,
  signal?: AbortSignal,
): Promise<StormglassTideTable | null> {
  const key = process.env.STORMGLASS_API_KEY?.trim();
  if (!key) return null;

  const url = new URL("https://api.stormglass.io/v2/tide/extremes/point");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));
  url.searchParams.set("start", fmt(start));
  url.searchParams.set("end", fmt(end));
  /** MLLW: heights above mean lower low water (chart-style datum). MSL gives signed deviation from average sea level. */
  url.searchParams.set("datum", "MLLW");

  logStormglassRequest(TIDE_LOG_FILE, "fetchStormglassTideExtremesNetwork", url);

  try {
    const r = await fetch(url.toString(), {
      signal,
      headers: { Authorization: key },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      data?: { height?: number; time?: string; type?: string }[];
      meta?: {
        station?: { name?: string; distance?: number };
        datum?: string;
      };
    };
    const rows = Array.isArray(j.data) ? j.data : [];
    const events: TideTableEvent[] = rows
      .map((row) => {
        const t = typeof row.time === "string" ? row.time : null;
        const hRaw = row.height;
        const h =
          typeof hRaw === "number" && Number.isFinite(hRaw)
            ? hRaw
            : typeof hRaw === "string" && Number.isFinite(Number(hRaw))
              ? Number(hRaw)
              : null;
        const typ = typeof row.type === "string" ? row.type.toLowerCase() : "";
        if (!t || h == null) return null;
        const kind: "high" | "low" | null = typ.includes("high") ? "high" : typ.includes("low") ? "low" : null;
        if (!kind) return null;
        return { kind, t, heightM: h };
      })
      .filter((x): x is TideTableEvent => Boolean(x));

    if (!events.length) return null;

    const meta = j.meta && typeof j.meta === "object" ? (j.meta as Record<string, unknown>) : {};
    const st = meta.station && typeof meta.station === "object" ? (meta.station as Record<string, unknown>) : null;
    const stationName =
      st && typeof st.name === "string" && st.name.trim() ? st.name.trim() : "Nearest station";
    const distRaw = st && typeof st.distance === "number" && Number.isFinite(st.distance) ? st.distance : null;
    /** Stormglass returns station distance in metres. */
    const distanceKm = distRaw != null ? distRaw / 1000 : null;
    const datum = typeof j.meta?.datum === "string" && j.meta.datum ? j.meta.datum : "MLLW";

    return {
      source: "stormglass",
      stationName,
      distanceKm,
      datum,
      events,
    };
  } catch {
    return null;
  }
}

/**
 * 60-minute RAM cache + in-flight de-duplication for tide extremes.
 */
export async function fetchStormglassTideExtremesCached(
  lat: number,
  lng: number,
  start: Date,
  end: Date,
  signal?: AbortSignal,
): Promise<{ table: StormglassTideTable | null; meta: StormglassTideFetchMeta }> {
  const key = tideCacheKey(lat, lng, start, end);
  const hit = tideExtremesCache.get(key);
  if (hit && Date.now() - hit.storedAt < TIDE_CACHE_TTL_MS) {
    return { table: hit.value, meta: "memory" };
  }

  const existing = tideInflight.get(key);
  if (existing) {
    const table = await existing;
    return { table, meta: "deduped" };
  }

  const networkPromise = new Promise<StormglassTideTable | null>((resolve, reject) => {
    queueMicrotask(async () => {
      try {
        const table = await fetchStormglassTideExtremesNetwork(lat, lng, start, end, signal);
        tideExtremesCache.set(key, { storedAt: Date.now(), value: table });
        resolve(table);
      } catch (e) {
        reject(e);
      }
    });
  });

  tideInflight.set(key, networkPromise);
  networkPromise.finally(() => {
    tideInflight.delete(key);
  });

  const table = await networkPromise;
  return { table, meta: "network" };
}
