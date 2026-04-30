import { NextResponse } from "next/server";

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

type TideEvent = { kind: "high" | "low"; t: string; v: number };
type TideEventOut = {
  kind: "high" | "low";
  t: string;
  // Raw model output: sea level relative to global mean sea level (can be negative).
  vMsl: number;
  // Relative to local mean (centred around 0).
  vRelMean: number;
  // Relative to local modelled low over the returned window (positive, “tide-table-ish”).
  vAboveLow: number;
};

type TideTableEvent = { kind: "high" | "low"; t: string; heightM: number };

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

async function loadNoaaStations(): Promise<NoaaStation[]> {
  const now = Date.now();
  if (noaaStationsCache && now - noaaStationsCache.fetchedAtMs < NOAA_CACHE_TTL_MS) return noaaStationsCache.stations;

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
  return out;
}

async function noaaTideTable(coords: { lat: number; lng: number }): Promise<{
  source: "noaa";
  stationId: string;
  stationName: string;
  distanceKm: number;
  datum: string;
  timeZone: "lst_ldt";
  events: TideTableEvent[];
} | null> {
  const stations = await loadNoaaStations();
  if (!stations.length) return null;

  let best: { st: NoaaStation; dKm: number } | null = null;
  for (const st of stations) {
    const dKm = haversineKm(coords, { lat: st.lat, lng: st.lon });
    if (!best || dKm < best.dKm) best = { st, dKm };
  }
  if (!best) return null;
  // NOAA coverage is mostly US; avoid showing nonsense if we're far away.
  if (best.dKm > 250) return null;

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
  const now = new Date();
  const begin = ymd(now);
  const end = ymd(new Date(now.getTime() + 48 * 60 * 60 * 1000));

  const api = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  api.searchParams.set("product", "predictions");
  api.searchParams.set("application", "sealink");
  api.searchParams.set("begin_date", begin);
  api.searchParams.set("end_date", end);
  api.searchParams.set("datum", "MLLW");
  api.searchParams.set("station", best.st.id);
  api.searchParams.set("time_zone", "lst_ldt");
  api.searchParams.set("units", "metric");
  api.searchParams.set("interval", "hilo");
  api.searchParams.set("format", "json");

  const r = await fetch(api.toString(), { cache: "no-store" });
  if (!r.ok) return null;
  const j = (await r.json()) as any;
  const preds = j?.predictions;
  if (!Array.isArray(preds)) return null;

  const events: TideTableEvent[] = preds
    .map((p: any) => {
      const t = typeof p?.t === "string" ? p.t : null;
      const v = typeof p?.v === "string" ? Number(p.v) : typeof p?.v === "number" ? p.v : NaN;
      const typ = typeof p?.type === "string" ? p.type : "";
      if (!t || !Number.isFinite(v)) return null;
      const kind: "high" | "low" | null = typ === "H" || typ.toLowerCase().includes("high") ? "high" : typ === "L" || typ.toLowerCase().includes("low") ? "low" : null;
      if (!kind) return null;
      // NOAA returns local time string without timezone, e.g. "2026-04-30 07:03"
      const isoish = t.includes("T") ? t : t.replace(" ", "T");
      return { kind, t: isoish, heightM: v };
    })
    .filter(Boolean) as TideTableEvent[];

  if (!events.length) return null;
  return {
    source: "noaa",
    stationId: best.st.id,
    stationName: best.st.name,
    distanceKm: best.dKm,
    datum: "MLLW",
    timeZone: "lst_ldt",
    events,
  };
}

function findNextTides(times: string[], sea: number[], nowMs: number, limit = 4): TideEvent[] {
  const out: TideEvent[] = [];
  for (let i = 1; i < sea.length - 1; i++) {
    const t = times[i];
    if (!t) continue;
    const ms = new Date(t).getTime();
    if (!Number.isFinite(ms) || ms <= nowMs) continue;
    const a = sea[i - 1]!;
    const b = sea[i]!;
    const c = sea[i + 1]!;
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) continue;
    if (b >= a && b >= c) out.push({ kind: "high", t, v: b });
    else if (b <= a && b <= c) out.push({ kind: "low", t, v: b });
    if (out.length >= limit) break;
  }
  return out;
}

function meanFinite(vals: number[]): number | null {
  let sum = 0;
  let n = 0;
  for (const v of vals) {
    if (!Number.isFinite(v)) continue;
    sum += v;
    n += 1;
  }
  if (!n) return null;
  return sum / n;
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

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const coords = clampLatLng(lat, lng);
  if (!coords) return NextResponse.json({ error: "lat and lng required" }, { status: 400 });

  const api = new URL("https://marine-api.open-meteo.com/v1/marine");
  api.searchParams.set("latitude", String(coords.lat));
  api.searchParams.set("longitude", String(coords.lng));
  api.searchParams.set(
    "hourly",
    [
      "wave_height",
      "wave_period",
      "wave_direction",
      "sea_surface_temperature",
      "sea_level_height_msl",
    ].join(","),
  );
  api.searchParams.set("timezone", "auto");
  api.searchParams.set("forecast_days", "3");
  api.searchParams.set("length_unit", "metric");

  try {
    const noaa = await noaaTideTable(coords);
    const worldTidesKey = process.env.WORLD_TIDES_API_KEY;
    let tideTable: {
      source: "worldtides";
      datum: string;
      timezone: string | null;
      atlas: string | null;
      station: string | null;
      copyright: string | null;
      events: TideTableEvent[];
    } | null = null;

    if (typeof worldTidesKey === "string" && worldTidesKey.trim()) {
      const wt = new URL("https://www.worldtides.info/api/v3");
      wt.searchParams.set("extremes", "");
      wt.searchParams.set("datum", "CD");
      wt.searchParams.set("date", "today");
      wt.searchParams.set("days", "2");
      wt.searchParams.set("localtime", "");
      // Prefer a real tidal gauge station when one is nearby.
      wt.searchParams.set("stationDistance", "50");
      wt.searchParams.set("units", "meters");
      wt.searchParams.set("lat", String(coords.lat));
      wt.searchParams.set("lon", String(coords.lng));
      wt.searchParams.set("key", worldTidesKey.trim());

      try {
        const wr = await fetch(wt.toString(), { cache: "no-store" });
        if (wr.ok) {
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
                return { kind, t, heightM: h };
              })
              .filter((x): x is TideTableEvent => Boolean(x));

            tideTable = {
              source: "worldtides",
              datum: typeof wj.responseDatum === "string" && wj.responseDatum ? wj.responseDatum : "CD",
              timezone: typeof wj.timezone === "string" ? wj.timezone : null,
              atlas: typeof wj.atlas === "string" ? wj.atlas : null,
              station: typeof wj.station === "string" ? wj.station : null,
              copyright: typeof wj.copyright === "string" ? wj.copyright : null,
              events,
            };
          }
        }
      } catch {
        // Ignore WorldTides errors and fall back to modelled tide levels.
      }
    }

    const r = await fetch(api.toString(), { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: `Marine request failed (${r.status})` }, { status: 502 });
    const data = (await r.json()) as MarineResp;
    const h = data.hourly;
    const times = (h?.time ?? []) as string[];
    if (!times.length) return NextResponse.json({ error: "No marine data returned" }, { status: 502 });

    // Find nearest hour index.
    const now = Date.now();
    let idx = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < times.length; i++) {
      const ms = new Date(times[i]!).getTime();
      const d = Math.abs(ms - now);
      if (d < best) {
        best = d;
        idx = i;
      }
    }

    const waveM = numAt(h?.wave_height, idx);
    const waveP = numAt(h?.wave_period, idx);
    const waveD = numAt(h?.wave_direction, idx);
    const sst = numAt(h?.sea_surface_temperature, idx);
    const sea = (h?.sea_level_height_msl ?? []) as number[];
    const seaTimes = times;

    const tides =
      Array.isArray(sea) && sea.length === seaTimes.length ? findNextTides(seaTimes, sea, now, 4) : [];
    const seaStats =
      Array.isArray(sea) && sea.length === seaTimes.length
        ? { mean: meanFinite(sea), mm: minMaxFinite(sea) }
        : { mean: null, mm: null };
    const relMean0 = seaStats.mean ?? 0;
    const relLow0 = seaStats.mm?.min ?? 0;
    const tideEvents: TideEventOut[] = tides.map((e) => ({
      kind: e.kind,
      t: e.t,
      vMsl: e.v,
      vRelMean: e.v - relMean0,
      vAboveLow: e.v - relLow0,
    }));
    const rangeM = seaStats.mm ? seaStats.mm.max - seaStats.mm.min : null;

    const parts: string[] = [];
    if (waveM != null) {
      const lbl = waveLabel(waveM);
      const dir = dirText(waveD);
      parts.push(
        `Sea state looks ${lbl} with waves around ${waveM.toFixed(1)}m${waveP != null ? ` (period ${Math.round(waveP)}s)` : ""}${dir ? ` from ${dir}` : ""}.`,
      );
    }
    if (sst != null) parts.push(`Sea surface temperature is about ${sst.toFixed(1)}°C.`);
    if (tides.length) {
      const fmt = (iso: string) =>
        new Date(iso).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
      const tideBits = tides
        .slice(0, 2)
        .map((e) => `${e.kind === "high" ? "High" : "Low"} tide ~${fmt(e.t)}`);
      const rangeTxt = rangeM != null ? ` Range ~${rangeM.toFixed(1)}m.` : "";
      parts.push(`${tideBits.join(" · ")} (modelled).${rangeTxt}`);
    } else {
      parts.push("Tide estimate unavailable for this area.");
    }

    const text = parts.join(" ");
    return NextResponse.json({
      ok: true,
      text,
      now: new Date(now).toISOString(),
      hourly_units: data.hourly_units ?? {},
      snapshot: {
        wave_height_m: waveM,
        wave_period_s: waveP,
        wave_direction_deg: waveD,
        sea_surface_temp_c: sst,
      },
      tide: {
        events: tideEvents,
        rangeM,
        datum: "msl",
      },
      tideTable,
      noaaTideTable: noaa,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Network error" }, { status: 502 });
  }
}

