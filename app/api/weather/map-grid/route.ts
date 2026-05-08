import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Overlay =
  | "waves"
  | "wave_direction"
  | "wind"
  | "wind_direction"
  | "rain"
  | "pressure";

type GridPoint = {
  lat: number;
  lng: number;
  waveHeightM?: number | null;
  waveDirDeg?: number | null;
  windSpeedMs?: number | null;
  windDirDeg?: number | null;
  precipMm?: number | null;
  pressureHpa?: number | null;
};

type CacheEntry = { storedAtMs: number; value: { ok: true; points: GridPoint[]; fetchedAtIso: string } };

const CACHE_TTL_MS = 12 * 60 * 1000; // 10–15 min target
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry["value"]>>();

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function bucketCoord(n: number): number {
  // ~0.02° ≈ 2km lat — good balance for 10–15m caching.
  return Math.round(n * 50) / 50;
}

function bucketZoom(z: number): number {
  if (!Number.isFinite(z)) return 0;
  if (z >= 13) return 13;
  if (z >= 12) return 12;
  if (z >= 11) return 11;
  if (z >= 10) return 10;
  return 9;
}

function cacheKey(lat: number, lng: number, overlay: Overlay, zoom: number): string {
  return `lat=${bucketCoord(lat).toFixed(2)}|lng=${bucketCoord(lng).toFixed(2)}|z=${bucketZoom(zoom)}|overlay=${overlay}`;
}

function buildGrid(lat: number, lng: number, zoom: number): { lat: number; lng: number }[] {
  // Denser grid as the user zooms in so arrows stay informative locally.
  // Keep the overall coverage similar (~±0.04°) while shrinking step size.
  const z = bucketZoom(zoom);
  const step = z >= 13 ? 0.0075 : z >= 12 ? 0.01 : z >= 11 ? 0.0125 : z >= 10 ? 0.015 : 0.02;
  const half = z >= 12 ? 4 : z >= 10 ? 3 : 2; // 9x9, 7x7, 5x5
  const out: { lat: number; lng: number }[] = [];
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      out.push({ lat: lat + dy * step, lng: lng + dx * step });
    }
  }
  return out;
}

function nearestHourIdx(times: string[], nowMs: number): number {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const ms = Date.parse(times[i] || "");
    if (!Number.isFinite(ms)) continue;
    const d = Math.abs(ms - nowMs);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

async function fetchOpenMeteoMarine(lat: number, lng: number, signal?: AbortSignal) {
  const url = new URL("https://marine-api.open-meteo.com/v1/marine");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("hourly", "wave_height,wave_direction,wind_speed_10m,wind_direction_10m,precipitation,pressure_msl");

  const r = await fetch(url.toString(), { cache: "no-store", signal });
  if (!r.ok) throw new Error(`Open-Meteo Marine ${r.status}`);
  return (await r.json()) as {
    hourly?: {
      time?: string[];
      wave_height?: number[];
      wave_direction?: number[];
      wind_speed_10m?: number[];
      wind_direction_10m?: number[];
      precipitation?: number[];
      pressure_msl?: number[];
    };
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const overlay = (url.searchParams.get("overlay") || "waves") as Overlay;
  const zoom = Number(url.searchParams.get("z") ?? "0");

  const coords = clampLatLng(lat, lng);
  if (!coords) return NextResponse.json({ error: "lat and lng required" }, { status: 400 });

  const allowed: Overlay[] = ["waves", "wave_direction", "wind", "wind_direction", "rain", "pressure"];
  if (!allowed.includes(overlay)) return NextResponse.json({ error: "invalid overlay" }, { status: 400 });

  const key = cacheKey(coords.lat, coords.lng, overlay, zoom);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.storedAtMs < CACHE_TTL_MS) {
    console.info("WEATHER_MAP_CACHE_HIT", { key });
    return NextResponse.json(hit.value);
  }

  console.info("WEATHER_MAP_CACHE_MISS", { key });
  const existing = inflight.get(key);
  if (existing) {
    const v = await existing;
    return NextResponse.json(v);
  }

  const p = (async () => {
    console.info("WEATHER_MAP_FETCH", { overlay });
    const grid = buildGrid(bucketCoord(coords.lat), bucketCoord(coords.lng), zoom);
    const nowMs = Date.now();

    const results = await Promise.all(
      grid.map(async (pt) => {
        const j = await fetchOpenMeteoMarine(pt.lat, pt.lng, req.signal);
        const t = j.hourly?.time ?? [];
        const idx = t.length ? nearestHourIdx(t, nowMs) : 0;
        const point: GridPoint = { lat: pt.lat, lng: pt.lng };

        // Always compute all fields (small payload) so overlay changes can reuse server cache by overlay key.
        point.waveHeightM = j.hourly?.wave_height?.[idx] ?? null;
        point.waveDirDeg = j.hourly?.wave_direction?.[idx] ?? null;
        point.windSpeedMs = j.hourly?.wind_speed_10m?.[idx] ?? null;
        point.windDirDeg = j.hourly?.wind_direction_10m?.[idx] ?? null;
        point.precipMm = j.hourly?.precipitation?.[idx] ?? null;
        point.pressureHpa = j.hourly?.pressure_msl?.[idx] ?? null;

        return point;
      }),
    );

    const value = { ok: true as const, points: results, fetchedAtIso: new Date().toISOString() };
    cache.set(key, { storedAtMs: Date.now(), value });
    return value;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, p);
  const v = await p;
  return NextResponse.json(v);
}

