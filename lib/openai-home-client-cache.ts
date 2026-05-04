/**
 * Client-side cache for home OpenAI-backed content (48h outlook + tide web search / tide narrative).
 * Rules: reuse when same local calendar day, data under 6h old, position within 0.5 miles of origin;
 * never trigger a fresh OpenAI-backed network refresh more than once per 30 minutes (show stale if needed).
 */

export const HOME_OPENAI_CACHE_STORAGE_KEY = "sealink_home_openai_cache_v1";

export const HOME_OPENAI_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** 0.5 miles in kilometres */
export const HOME_OPENAI_MAX_DISTANCE_KM = 0.5 / 0.621371;
export const HOME_OPENAI_MIN_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export type TideWebSearchPayload = {
  source: "openai_web_search";
  regionLine: string;
  datum: string | null;
  events: { kind: "high" | "low"; t: string; heightM: number }[];
  heightSummary?: {
    nextHighM: number | null;
    nextLowM: number | null;
    nextHighT: string | null;
    nextLowT: string | null;
    rangeM: number | null;
  };
};

export type Forecast48hCacheEntry = {
  text: string;
  model?: string;
  openAi?: boolean;
  generatedAt: number;
  originLat: number;
  originLng: number;
  storedDay: string;
};

export type SeaOpenAiCacheEntry = {
  tideWebSearch: TideWebSearchPayload | null;
  tideAiNarrative: string | null;
  generatedAt: number;
  originLat: number;
  originLng: number;
  storedDay: string;
};

export type HomeOpenAiCacheV1 = {
  v: 1;
  /** Last time a server response indicated OpenAI was invoked for home (forecast or sea). */
  lastOpenAiUsageAt: number;
  forecast48h: Forecast48hCacheEntry | null;
  seaOpenAi: SeaOpenAiCacheEntry | null;
};

export function localCalendarDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function entryFreshForLocation(
  entry: { generatedAt: number; originLat: number; originLng: number; storedDay: string },
  now: number,
  current: { lat: number; lng: number },
): boolean {
  if (entry.storedDay !== localCalendarDayKey(new Date(now))) return false;
  if (now - entry.generatedAt > HOME_OPENAI_MAX_AGE_MS) return false;
  const dKm = haversineKm({ lat: entry.originLat, lng: entry.originLng }, current);
  return dKm <= HOME_OPENAI_MAX_DISTANCE_KM;
}

function throttleBlocksOpenAiRefresh(
  now: number,
  lastOpenAiUsageAt: number,
  hasStalePayload: boolean,
): boolean {
  if (!hasStalePayload) return false;
  if (!Number.isFinite(lastOpenAiUsageAt) || lastOpenAiUsageAt <= 0) return false;
  return now - lastOpenAiUsageAt < HOME_OPENAI_MIN_REFRESH_INTERVAL_MS;
}

export function readHomeOpenAiCache(): HomeOpenAiCacheV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HOME_OPENAI_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<HomeOpenAiCacheV1>;
    if (j?.v !== 1) return null;
    return {
      v: 1,
      lastOpenAiUsageAt: typeof j.lastOpenAiUsageAt === "number" ? j.lastOpenAiUsageAt : 0,
      forecast48h: j.forecast48h ?? null,
      seaOpenAi: j.seaOpenAi ?? null,
    };
  } catch {
    return null;
  }
}

export function writeHomeOpenAiCache(next: HomeOpenAiCacheV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HOME_OPENAI_CACHE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

function emptyHomeOpenAiCache(): HomeOpenAiCacheV1 {
  return {
    v: 1,
    lastOpenAiUsageAt: 0,
    forecast48h: null,
    seaOpenAi: null,
  };
}

/** Serialize read–merge–write so concurrent/re-entrant patches cannot drop updates (e.g. sea + forecast). */
let homeOpenAiPatching = false;
const homeOpenAiDeferredPatches: Partial<HomeOpenAiCacheV1>[] = [];

export function patchHomeOpenAiCache(patch: Partial<HomeOpenAiCacheV1>): void {
  if (homeOpenAiPatching) {
    homeOpenAiDeferredPatches.push(patch);
    return;
  }
  homeOpenAiPatching = true;
  try {
    let batch: Partial<HomeOpenAiCacheV1>[] = [patch];
    while (batch.length > 0) {
      const cur = readHomeOpenAiCache();
      const base: HomeOpenAiCacheV1 = cur ?? emptyHomeOpenAiCache();
      let next: HomeOpenAiCacheV1 = base;
      for (const p of batch) {
        next = { ...next, ...p, v: 1 };
      }
      writeHomeOpenAiCache(next);
      batch = homeOpenAiDeferredPatches.splice(0);
    }
  } finally {
    homeOpenAiPatching = false;
  }
}

export type ForecastNetworkDecision =
  | { mode: "cache-hit"; entry: Forecast48hCacheEntry }
  | { mode: "network"; reason: "no-cache" | "new-day" | "stale-or-moved" }
  | { mode: "stale-throttled"; entry: Forecast48hCacheEntry };

export function decideForecast48hFetch(args: {
  now: number;
  current: { lat: number; lng: number };
  cache: HomeOpenAiCacheV1 | null;
}): ForecastNetworkDecision {
  const { now, current, cache } = args;
  const entry = cache?.forecast48h ?? null;
  const today = localCalendarDayKey(new Date(now));

  if (!entry || !entry.text) {
    return { mode: "network", reason: "no-cache" };
  }
  if (entry.storedDay !== today) {
    return { mode: "network", reason: "new-day" };
  }
  if (entryFreshForLocation(entry, now, current)) {
    return { mode: "cache-hit", entry };
  }
  if (throttleBlocksOpenAiRefresh(now, cache?.lastOpenAiUsageAt ?? 0, Boolean(entry.text))) {
    return { mode: "stale-throttled", entry };
  }
  return { mode: "network", reason: "stale-or-moved" };
}

export type SeaOpenAiFetchPlan = {
  skipOpenAi: boolean;
  mergeFromCache: SeaOpenAiCacheEntry | null;
};

export function planSeaLocalSummaryOpenAi(args: {
  now: number;
  current: { lat: number; lng: number };
  cache: HomeOpenAiCacheV1 | null;
}): SeaOpenAiFetchPlan {
  const { now, current, cache } = args;
  const sea = cache?.seaOpenAi ?? null;
  const today = localCalendarDayKey(new Date(now));

  if (!sea) {
    return { skipOpenAi: false, mergeFromCache: null };
  }
  if (sea.storedDay !== today) {
    return { skipOpenAi: false, mergeFromCache: null };
  }
  if (entryFreshForLocation(sea, now, current)) {
    return { skipOpenAi: true, mergeFromCache: sea };
  }
  const hasStale =
    Boolean(sea.tideWebSearch?.events?.length) ||
    Boolean(sea.tideAiNarrative && sea.tideAiNarrative.trim().length > 0);
  if (throttleBlocksOpenAiRefresh(now, cache?.lastOpenAiUsageAt ?? 0, hasStale)) {
    return { skipOpenAi: true, mergeFromCache: sea };
  }
  return { skipOpenAi: false, mergeFromCache: null };
}

/** When server skipped OpenAI but we restored web-search tides from cache, fix the summary sentence. */
export function patchSeaSummaryTextForMergedWebSearch(text: string, displayLabel: string): string {
  const needle = "Tide times unavailable: set OPENAI_API_KEY for web-search tides, or add NOAA / Stormglass / WorldTides keys.";
  if (!text.includes(needle)) return text;
  const replacement = `Today's high and low waters for ${displayLabel} are from a live web search — double‑check before navigation.`;
  return text.replace(needle, replacement);
}

export function recordOpenAiUsageIfApplicable(flags: { forecastUsedOpenAi?: boolean; seaUsedOpenAi?: boolean }): void {
  if (!flags.forecastUsedOpenAi && !flags.seaUsedOpenAi) return;
  patchHomeOpenAiCache({ lastOpenAiUsageAt: Date.now() });
}
