import { NextResponse } from "next/server";
import {
  fetchStormglassTideExtremesCached,
  peekStormglassTideExtremesCache,
} from "@/lib/stormglass-tide";
import {
  stormglassBudgetClientKey,
  stormglassMemoryReleaseUpstreamSlot,
  stormglassMemoryReserveUpstreamSlot,
} from "@/lib/stormglass-session-budget";
import { resolveSeaTideContext, tideDisplayTimeZone } from "@/lib/sea-tide-context";
import type { TideTableEvent } from "@/lib/tide-table-types";
import { tideFactsNarrative, type TideFact } from "@/lib/tide-ai-narrative";
import { summarizeTideExtremes } from "@/lib/tide-height-summary";
import { fetchTideScheduleFromWebSearch, type TideWebSearchResult } from "@/lib/tide-ai-web-schedule";
import { tideKvGet, tideKvSet } from "@/lib/tide-kv-cache";

export const runtime = "nodejs";

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

type MarineResp = {
  hourly?: Record<string, (number | string)[] | undefined> & { time?: string[] };
  hourly_units?: Record<string, string>;
  timezone?: string;
};

type WorldTidesExtreme = { dt: number; date: string; height: number; type: "High" | "Low" | string };
type WorldTidesResp = {
  status?: number;
  error?: string;
  requestDatum?: string;
  responseDatum?: string;
  timezone?: string;
  atlas?: string;
  station?: string;
  copyright?: string;
  extremes?: WorldTidesExtreme[];
  callCount?: number;
};

type NoaaStation = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

function numAt(arr: unknown, idx: number): number | null {
  if (!Array.isArray(arr)) return null;
  const v = arr[idx];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function waveLabel(m: number): string {
  if (m < 0.3) return "glassy";
  if (m < 0.6) return "slight";
  if (m < 1.25) return "moderate";
  if (m < 2.5) return "rough";
  if (m < 4) return "very rough";
  return "phenomenal";
}

function dirText(deg: number | null): string | null {
  if (deg == null) return null;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[i] ?? null;
}

export type TideHeightSummary = ReturnType<typeof summarizeTideExtremes>;

function tideMslOffsetMeters(): number {
  const raw = process.env.TIDE_ESTIMATED_MSL_OFFSET_METERS?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function openMeteoMarineUrl(lat: number, lng: number, hourlyFields: string[]): string {
  const api = new URL("https://marine-api.open-meteo.com/v1/marine");
  api.searchParams.set("latitude", String(lat));
  api.searchParams.set("longitude", String(lng));
  api.searchParams.set("hourly", hourlyFields.join(","));
  api.searchParams.set("timezone", "auto");
  api.searchParams.set("forecast_days", "3");
  api.searchParams.set("length_unit", "metric");
  return api.toString();
}

function withHeightSummary<T extends { events: TideTableEvent[] }>(
  full: T | null,
  nowMs: number,
): (T & { heightSummary: TideHeightSummary }) | null {
  if (!full || !full.events.length) return null;
  return { ...full, heightSummary: summarizeTideExtremes(full.events, nowMs) };
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

let noaaStationsCache: { fetchedAtMs: number; stations: NoaaStation[] } | null = null;
const NOAA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NOAA_CACHE_TTL_S = Math.round(NOAA_CACHE_TTL_MS / 1000);

async function loadNoaaStations(): Promise<NoaaStation[]> {
  const now = Date.now();
  if (noaaStationsCache && now - noaaStationsCache.fetchedAtMs < NOAA_CACHE_TTL_MS) return noaaStationsCache.stations;

  const kvResult = await tideKvGet<NoaaStation[]>("noaa:stations", NOAA_CACHE_TTL_MS);
  if (kvResult.hit && Array.isArray(kvResult.value) && kvResult.value.length > 0) {
    noaaStationsCache = { fetchedAtMs: now, stations: kvResult.value };
    return kvResult.value;
  }

  const url = new URL("https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json");
  url.searchParams.set("type", "tidepredictions");

  const r = await fetch(url.toString(), { cache: "no-store" });
  if (!r.ok) return noaaStationsCache?.stations ?? [];
  const j = (await r.json()) as unknown;
  const stationsRaw = j && typeof j === "object" ? (j as Record<string, unknown>).stations : null;
  const out: NoaaStation[] = [];
  if (Array.isArray(stationsRaw)) {
    for (const s of stationsRaw) {
      if (!s || typeof s !== "object") continue;
      const o = s as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : null;
      const name = typeof o.name === "string" ? o.name : null;
      const lat = typeof o.lat === "string" ? Number(o.lat) : typeof o.lat === "number" ? o.lat : NaN;
      const lon = typeof o.lng === "string" ? Number(o.lng) : typeof o.lng === "number" ? o.lng : NaN;
      if (!id || !name) continue;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      out.push({ id, name, lat, lon });
    }
  }

  noaaStationsCache = { fetchedAtMs: now, stations: out };
  if (out.length > 0) void tideKvSet("noaa:stations", out, NOAA_CACHE_TTL_S);
  return out;
}

type NoaaTideTableFull = {
  source: "noaa";
  stationId: string;
  stationName: string;
  distanceKm: number;
  datum: string;
  timeZone: "lst_ldt";
  events: TideTableEvent[];
};

type CachedNoaaTidePredictions = { storedAt: number; value: NoaaTideTableFull | null };
const noaaTidePredictionsCache = new Map<string, CachedNoaaTidePredictions>();
const noaaTidePredictionsInflight = new Map<string, Promise<NoaaTideTableFull | null>>();
const NOAA_TIDE_PREDICTIONS_TTL_MS = 12 * 60 * 60 * 1000;
const NOAA_TIDE_PREDICTIONS_TTL_S = Math.round(NOAA_TIDE_PREDICTIONS_TTL_MS / 1000);

async function noaaTideTable(coords: { lat: number; lng: number }): Promise<NoaaTideTableFull | null> {
  const stations = await loadNoaaStations();
  if (!stations.length) return null;

  let best: { st: NoaaStation; dKm: number } | null = null;
  for (const st of stations) {
    const dKm = haversineKm(coords, { lat: st.lat, lng: st.lon });
    if (!best || dKm < best.dKm) best = { st, dKm };
  }
  if (!best) return null;
  if (best.dKm > 250) return null;

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
  const now = new Date();
  const begin = ymd(now);
  const end = ymd(new Date(now.getTime() + 48 * 60 * 60 * 1000));
  const cacheKey = `${best.st.id}|${begin}|${end}`;

  const ramHit = noaaTidePredictionsCache.get(cacheKey);
  if (ramHit && Date.now() - ramHit.storedAt < NOAA_TIDE_PREDICTIONS_TTL_MS) return ramHit.value;

  const kvResult = await tideKvGet<NoaaTideTableFull | null>(`noaa:pred:${cacheKey}`, NOAA_TIDE_PREDICTIONS_TTL_MS);
  if (kvResult.hit) {
    noaaTidePredictionsCache.set(cacheKey, { storedAt: Date.now(), value: kvResult.value });
    return kvResult.value;
  }

  const existing = noaaTidePredictionsInflight.get(cacheKey);
  if (existing) return existing;

  const networkPromise: Promise<NoaaTideTableFull | null> = (async () => {
    const api = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
    api.searchParams.set("product", "predictions");
    api.searchParams.set("application", "sealink");
    api.searchParams.set("begin_date", begin);
    api.searchParams.set("end_date", end);
    api.searchParams.set("datum", "MLLW");
    api.searchParams.set("station", best!.st.id);
    api.searchParams.set("time_zone", "lst_ldt");
    api.searchParams.set("units", "metric");
    api.searchParams.set("interval", "hilo");
    api.searchParams.set("format", "json");

    const r = await fetch(api.toString(), { cache: "no-store" });
    if (!r.ok) return null;
    const j: unknown = await r.json();
    const obj = typeof j === "object" && j !== null ? (j as Record<string, unknown>) : null;
    const preds = obj?.predictions;
    if (!Array.isArray(preds)) return null;

    const events: TideTableEvent[] = preds
      .map((p: unknown) => {
        const row = typeof p === "object" && p !== null ? (p as Record<string, unknown>) : null;
        const t = typeof row?.t === "string" ? row.t : null;
        const v = typeof row?.v === "string" ? Number(row.v) : typeof row?.v === "number" ? row.v : NaN;
        const typ = typeof row?.type === "string" ? row.type : "";
        if (!t || !Number.isFinite(v)) return null;
        const kind: "high" | "low" | null = typ === "H" || typ.toLowerCase().includes("high") ? "high" : typ === "L" || typ.toLowerCase().includes("low") ? "low" : null;
        if (!kind) return null;
        const isoish = t.includes("T") ? t : t.replace(" ", "T");
        return { kind, t: isoish, heightM: v };
      })
      .filter(Boolean) as TideTableEvent[];

    if (!events.length) return null;
    return {
      source: "noaa" as const,
      stationId: best!.st.id,
      stationName: best!.st.name,
      distanceKm: best!.dKm,
      datum: "MLLW",
      timeZone: "lst_ldt" as const,
      events,
    };
  })()
    .then((v) => {
      noaaTidePredictionsCache.set(cacheKey, { storedAt: Date.now(), value: v });
      void tideKvSet(`noaa:pred:${cacheKey}`, v, NOAA_TIDE_PREDICTIONS_TTL_S);
      return v;
    })
    .finally(() => {
      noaaTidePredictionsInflight.delete(cacheKey);
    });

  noaaTidePredictionsInflight.set(cacheKey, networkPromise);
  return networkPromise;
}

function minMaxFinite(vals: number[]): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let ok = false;
  for (const v of vals) {
    if (!Number.isFinite(v)) continue;
    ok = true;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return ok ? { min, max } : null;
}

const UPCOMING_MS = 36 * 60 * 60 * 1000;
const PAST_GRACE_MS = 25 * 60 * 1000;

function parseTideInstant(t: string): number {
  const isoish = t.includes("T") ? t : t.replace(" ", "T");
  return new Date(isoish).getTime();
}

function sortTideEvents(events: TideTableEvent[]): TideTableEvent[] {
  return [...events].sort((a, b) => parseTideInstant(a.t) - parseTideInstant(b.t));
}

/** Emphasise highs/lows across roughly the next 36h (and a short past grace). */
function windowUpcomingExtremes(events: TideTableEvent[], nowMs: number): TideTableEvent[] {
  if (!events.length) return [];
  const sorted = sortTideEvents(events);
  const t0 = nowMs - PAST_GRACE_MS;
  const t1 = nowMs + UPCOMING_MS;
  const win = sorted.filter((e) => {
    const ms = parseTideInstant(e.t);
    return Number.isFinite(ms) && ms >= t0 && ms <= t1;
  });
  if (win.length >= 3) return win;
  return sorted.filter((e) => parseTideInstant(e.t) >= nowMs).slice(0, 10);
}

type WorldTidesTable = {
  source: "worldtides";
  datum: string;
  timezone: string | null;
  atlas: string | null;
  station: string | null;
  copyright: string | null;
  events: TideTableEvent[];
};

type CachedWorldTides = { storedAt: number; value: WorldTidesTable | null };
const worldTidesCache = new Map<string, CachedWorldTides>();
const worldTidesInflight = new Map<string, Promise<WorldTidesTable | null>>();
const WORLD_TIDES_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const WORLD_TIDES_CACHE_TTL_S = Math.round(WORLD_TIDES_CACHE_TTL_MS / 1000);

function bucketCoord(n: number): number {
  return Math.round(n * 10) / 10;
}

function worldTidesCacheKey(coords: { lat: number; lng: number }): string {
  return `lat=${bucketCoord(coords.lat).toFixed(1)}|lng=${bucketCoord(coords.lng).toFixed(1)}|days=3|datum=CD`;
}

async function fetchWorldTidesTable(coords: { lat: number; lng: number }): Promise<WorldTidesTable | null> {
  const worldTidesKey = process.env.WORLD_TIDES_API_KEY;
  if (!(typeof worldTidesKey === "string" && worldTidesKey.trim())) return null;

  const key = worldTidesCacheKey(coords);
  const ramHit = worldTidesCache.get(key);
  if (ramHit && Date.now() - ramHit.storedAt < WORLD_TIDES_CACHE_TTL_MS) return ramHit.value;

  const kvResult = await tideKvGet<WorldTidesTable | null>(`wt:${key}`, WORLD_TIDES_CACHE_TTL_MS);
  if (kvResult.hit) {
    worldTidesCache.set(key, { storedAt: Date.now(), value: kvResult.value });
    return kvResult.value;
  }

  const existing = worldTidesInflight.get(key);
  if (existing) return existing;

  const networkPromise: Promise<WorldTidesTable | null> = (async () => {
  const wt = new URL("https://www.worldtides.info/api/v3");
  wt.searchParams.set("extremes", "");
  wt.searchParams.set("datum", "CD");
  wt.searchParams.set("date", "today");
  wt.searchParams.set("days", "3");
  wt.searchParams.set("localtime", "");
  wt.searchParams.set("stationDistance", "18");
  wt.searchParams.set("units", "meters");
  wt.searchParams.set("lat", String(coords.lat));
  wt.searchParams.set("lon", String(coords.lng));
  wt.searchParams.set("key", worldTidesKey.trim());

  try {
    const wr = await fetch(wt.toString(), { cache: "no-store" });
    if (!wr.ok) return null;
    const wj = (await wr.json()) as WorldTidesResp;
    if (wj && typeof wj === "object" && wj.status === 200 && Array.isArray(wj.extremes)) {
      const events: TideTableEvent[] = wj.extremes
        .map((e) => {
          if (!e || typeof e !== "object") return null;
          const t = typeof e.date === "string" ? e.date : null;
          const h = typeof e.height === "number" && Number.isFinite(e.height) ? e.height : null;
          const typ = typeof e.type === "string" ? e.type : "";
          if (!t || h == null) return null;
          const kind: "high" | "low" | null = typ.toLowerCase().includes("high")
            ? "high"
            : typ.toLowerCase().includes("low")
              ? "low"
              : null;
          if (!kind) return null;
          const isoish = t.includes("T") ? t : t.replace(" ", "T");
          return { kind, t: isoish, heightM: h };
        })
        .filter((x): x is TideTableEvent => Boolean(x));

      const out: WorldTidesTable = {
        source: "worldtides" as const,
        datum: typeof wj.responseDatum === "string" && wj.responseDatum ? wj.responseDatum : "CD",
        timezone: typeof wj.timezone === "string" ? wj.timezone : null,
        atlas: typeof wj.atlas === "string" ? wj.atlas : null,
        station: typeof wj.station === "string" ? wj.station : null,
        copyright: typeof wj.copyright === "string" ? wj.copyright : null,
        events,
      };
      return out;
    }
  } catch {
    /* ignore */
  }
  return null;
  })()
    .then((v) => {
      worldTidesCache.set(key, { storedAt: Date.now(), value: v });
      return v;
    })
    .finally(() => {
      worldTidesInflight.delete(key);
    });

  worldTidesInflight.set(key, networkPromise);
  return networkPromise;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const skipOpenAi =
    url.searchParams.get("skipOpenAi") === "1" || url.searchParams.get("skipOpenAi") === "true";
  const coords = clampLatLng(lat, lng);
  if (!coords) return NextResponse.json({ error: "lat and lng required" }, { status: 400 });

  const hourlyMarine = [
    "wave_height",
    "wave_period",
    "wave_direction",
    "sea_surface_temperature",
  ] as const;

  try {
    const tideNow = Date.now();
    const tideNowD = new Date(tideNow);
    const stormEnd = new Date(tideNow + 50 * 3600 * 1000);

    const seaTideContext = await resolveSeaTideContext(coords.lat, coords.lng, req.signal);
    const tq = seaTideContext.tideQuery;
    const tideCoords = { lat: tq.lat, lng: tq.lng };

    const marineUserUrl = openMeteoMarineUrl(coords.lat, coords.lng, [...hourlyMarine]);

    const budgetKey = stormglassBudgetClientKey(req);

    const stormglassPromise = (async () => {
      const lat = tideCoords.lat;
      const lng = tideCoords.lng;
      const warm = peekStormglassTideExtremesCache(lat, lng, tideNowD, stormEnd);
      if (!warm) {
        if (!stormglassMemoryReserveUpstreamSlot(budgetKey)) {
          return { table: null };
        }
        try {
          const r = await fetchStormglassTideExtremesCached(lat, lng, tideNowD, stormEnd, req.signal);
          if (r.meta !== "network") {
            stormglassMemoryReleaseUpstreamSlot(budgetKey);
          }
          return { table: r.table };
        } catch (e) {
          stormglassMemoryReleaseUpstreamSlot(budgetKey);
          throw e;
        }
      }
      const r = await fetchStormglassTideExtremesCached(lat, lng, tideNowD, stormEnd, req.signal);
      return { table: r.table };
    })();

    const [noaaFull, stormglassPack, rUser] = await Promise.all([
      noaaTideTable(tideCoords),
      stormglassPromise,
      fetch(marineUserUrl, { cache: "no-store", signal: req.signal }),
    ]);

    const stormglassFull = stormglassPack.table;
    // WorldTides fallback: same tide anchor as Stormglass/NOAA; cache keyed by rounded lat/lng for 12h.
    const tideTableFull =
      noaaFull?.events?.length || stormglassFull?.events?.length ? null : await fetchWorldTidesTable(tideCoords);

    if (!rUser.ok) return NextResponse.json({ error: `Marine request failed (${rUser.status})` }, { status: 502 });
    const dataUser = (await rUser.json()) as MarineResp;
    const hUser = dataUser.hourly;
    const timesUser = (hUser?.time ?? []) as string[];
    if (!timesUser.length) return NextResponse.json({ error: "No marine data returned" }, { status: 502 });

    function shrinkEventsTable<T extends { events: TideTableEvent[] }>(full: T | null, nowMs: number): T | null {
      if (!full?.events?.length) return full;
      const win = windowUpcomingExtremes(full.events, nowMs);
      const events = win.length ? win : sortTideEvents(full.events).slice(0, 8);
      return { ...full, events };
    }

    const noaa = shrinkEventsTable(noaaFull, tideNow);
    const stormglassTideTable = shrinkEventsTable(stormglassFull, tideNow);
    const tideTable = shrinkEventsTable(tideTableFull, tideNow);

    const now = tideNow;
    let idx = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < timesUser.length; i++) {
      const ms = new Date(timesUser[i]!).getTime();
      const d = Math.abs(ms - now);
      if (d < best) {
        best = d;
        idx = i;
      }
    }

    const waveM = numAt(hUser?.wave_height, idx);
    const waveP = numAt(hUser?.wave_period, idx);
    const waveD = numAt(hUser?.wave_direction, idx);
    const sst = numAt(hUser?.sea_surface_temperature, idx);

    const tz = tideDisplayTimeZone(seaTideContext);
    const hasOfficialTides =
      Boolean(noaa?.events?.length) ||
      Boolean(stormglassTideTable?.events?.length) ||
      Boolean(tideTable?.events?.length);

    let openAiInThisRequest = false;
    const openAiKey = process.env.OPENAI_API_KEY?.trim();

    let tideWebSearch: TideWebSearchResult | null = null;
    if (!skipOpenAi && !hasOfficialTides) {
      tideWebSearch = await fetchTideScheduleFromWebSearch({
        displayLabel: seaTideContext.displayLabel,
        detail: seaTideContext.detail,
        nearestMarinaName: seaTideContext.nearestMarina?.name ?? null,
        lat: tideCoords.lat,
        lng: tideCoords.lng,
        timeZone: tz,
        signal: req.signal,
      });
      if (openAiKey && tideWebSearch?.events?.length) {
        openAiInThisRequest = true;
      }
    }

    const webEvents = tideWebSearch?.events ?? [];
    const webHeightsMm = webEvents.length ? minMaxFinite(webEvents.map((e) => e.heightM)) : null;
    const rangeM = webHeightsMm ? webHeightsMm.max - webHeightsMm.min : null;

    const mslOff = tideMslOffsetMeters();
    const aiFacts: TideFact[] = [];
    if (noaa?.events?.length) {
      for (const e of noaa.events.slice(0, 10)) {
        const ms = parseTideInstant(e.t);
        if (!Number.isFinite(ms)) continue;
        aiFacts.push({ kind: e.kind, t: new Date(ms).toISOString(), heightM: e.heightM });
      }
    } else if (stormglassTideTable?.events?.length) {
      for (const e of stormglassTideTable.events.slice(0, 10)) {
        const ms = parseTideInstant(e.t);
        if (!Number.isFinite(ms)) continue;
        aiFacts.push({ kind: e.kind, t: new Date(ms).toISOString(), heightM: e.heightM });
      }
    } else if (tideTable?.events?.length) {
      for (const e of tideTable.events.slice(0, 10)) {
        const ms = parseTideInstant(e.t);
        if (!Number.isFinite(ms)) continue;
        aiFacts.push({ kind: e.kind, t: new Date(ms).toISOString(), heightM: e.heightM });
      }
    } else if (webEvents.length) {
      for (const e of webEvents.slice(0, 10)) {
        const ms = parseTideInstant(e.t);
        if (!Number.isFinite(ms)) continue;
        aiFacts.push({
          kind: e.kind,
          t: new Date(ms).toISOString(),
          heightM: e.heightM,
          sourceNote: "Web search — verify against official tables",
        });
      }
    }

    const useWebTable = Boolean(tideWebSearch?.events?.length);
    let tideAiNarrative: string | null = null;
    if (!skipOpenAi && !useWebTable && aiFacts.length >= 2) {
      tideAiNarrative = await tideFactsNarrative({
        placeLabel: seaTideContext.displayLabel,
        timeZone: tz,
        facts: aiFacts,
      });
      if (openAiKey && typeof tideAiNarrative === "string" && tideAiNarrative.trim().length > 0) {
        openAiInThisRequest = true;
      }
    }

    const parts: string[] = [];
    if (waveM != null) {
      const lbl = waveLabel(waveM);
      const dir = dirText(waveD);
      parts.push(
        `Sea state looks ${lbl} with waves around ${waveM.toFixed(1)}m${waveP != null ? ` (period ${Math.round(waveP)}s)` : ""}${dir ? ` from ${dir}` : ""}.`,
      );
    }
    if (sst != null) parts.push(`Sea surface temperature is about ${sst.toFixed(1)}°C.`);
    if (useWebTable) {
      parts.push(
        `Today's high and low waters for ${seaTideContext.displayLabel} are from a live web search — double‑check before navigation.`,
      );
    } else if (hasOfficialTides) {
      parts.push(`Tide times use an official or licensed prediction source for ${seaTideContext.displayLabel}.`);
    } else {
      parts.push(
        "Tide times unavailable: set OPENAI_API_KEY for web-search tides, or add NOAA / Stormglass / WorldTides keys.",
      );
    }

    const text = parts.join(" ");

    const tideWebSearchOut =
      tideWebSearch && tideWebSearch.events.length
        ? { ...tideWebSearch, heightSummary: summarizeTideExtremes(tideWebSearch.events, now) }
        : null;
    const webHeightSummary = tideWebSearchOut?.heightSummary ?? null;

    const res = NextResponse.json({
      ok: true,
      openAiInThisRequest,
      text,
      now: new Date(now).toISOString(),
      hourly_units: dataUser.hourly_units ?? {},
      snapshot: {
        wave_height_m: waveM,
        wave_period_s: waveP,
        wave_direction_deg: waveD,
        sea_surface_temp_c: sst,
      },
      seaTideContext,
      tideDisplayTimeZone: tz,
      tideAiNarrative,
      tideWebSearch: tideWebSearchOut,
      tide: {
        events: [],
        rangeM: useWebTable ? rangeM : null,
        datum: useWebTable ? "web_search" : "msl",
        mslOffsetM: mslOff,
        heightSummary: webHeightSummary,
      },
      tideTable: withHeightSummary(tideTable, now),
      stormglassTideTable: withHeightSummary(stormglassTideTable, now),
      noaaTideTable: withHeightSummary(noaa, now),
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Network error" }, { status: 502 });
  }
}

