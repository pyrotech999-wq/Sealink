/**
 * Server-side Open-Meteo sampling for weather map grids (wind + waves).
 * Used when Stormglass is unavailable or returns too few usable points.
 */

type OmWindBlock = {
  latitude?: number;
  longitude?: number;
  hourly?: {
    time?: string[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
    wave_height?: number[];
  };
};

function nearestTimeIndex(times: string[], timeIso: string): number {
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

export async function openMeteoWindGridPoints(
  points: { lat: number; lng: number }[],
  timeIso: string,
  signal?: AbortSignal,
): Promise<{ lat: number; lng: number; windSpeed: number; windDirection: number }[]> {
  if (!points.length) return [];
  const lats = points.map((p) => p.lat).join(",");
  const lngs = points.map((p) => p.lng).join(",");
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lats);
  url.searchParams.set("longitude", lngs);
  url.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m");
  url.searchParams.set("models", "ecmwf_ifs");
  url.searchParams.set("forecast_days", "5");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("cell_selection", "nearest");

  const r = await fetch(url.toString(), { cache: "no-store", signal });
  if (!r.ok) return [];
  const d: unknown = await r.json();
  const blocks: OmWindBlock[] = Array.isArray(d)
    ? (d as OmWindBlock[])
    : typeof d === "object" && d !== null && Array.isArray((d as OmWindBlock).hourly?.time)
      ? [d as OmWindBlock]
      : [];
  if (!blocks.length) return [];
  const times = blocks[0]?.hourly?.time as string[] | undefined;
  if (!times?.length) return [];
  const idx = nearestTimeIndex(times, timeIso);

  const out: { lat: number; lng: number; windSpeed: number; windDirection: number }[] = [];
  for (const b of blocks) {
    const usedLat = typeof b?.latitude === "number" ? b.latitude : null;
    const usedLng = typeof b?.longitude === "number" ? b.longitude : null;
    const spdArr = b?.hourly?.wind_speed_10m as number[] | undefined;
    const dirArr = b?.hourly?.wind_direction_10m as number[] | undefined;
    const spd = typeof spdArr?.[idx] === "number" ? spdArr[idx] : NaN;
    const dir = typeof dirArr?.[idx] === "number" ? dirArr[idx] : NaN;
    if (!Number.isFinite(spd) || !Number.isFinite(dir) || usedLat == null || usedLng == null) continue;
    out.push({ lat: usedLat, lng: usedLng, windSpeed: spd, windDirection: dir });
  }
  if (!out.length && points.length > 1) {
    const c = points[Math.floor(points.length / 2)]!;
    return openMeteoWindGridPoints([c], timeIso, signal);
  }
  return out;
}

export async function openMeteoWaveGridPoints(
  points: { lat: number; lng: number }[],
  timeIso: string,
  signal?: AbortSignal,
): Promise<{ lat: number; lng: number; waveHeight: number }[]> {
  if (!points.length) return [];
  const lats = points.map((p) => p.lat).join(",");
  const lngs = points.map((p) => p.lng).join(",");
  const url = new URL("https://marine-api.open-meteo.com/v1/marine");
  url.searchParams.set("latitude", lats);
  url.searchParams.set("longitude", lngs);
  url.searchParams.set("hourly", "wave_height");
  url.searchParams.set("forecast_days", "5");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("cell_selection", "sea");

  const r = await fetch(url.toString(), { cache: "no-store", signal });
  if (!r.ok) return [];
  const d: unknown = await r.json();
  const blocks: OmWindBlock[] = Array.isArray(d)
    ? (d as OmWindBlock[])
    : typeof d === "object" && d !== null && Array.isArray((d as OmWindBlock).hourly?.time)
      ? [d as OmWindBlock]
      : [];
  if (!blocks.length) return [];
  const times = blocks[0]?.hourly?.time as string[] | undefined;
  if (!times?.length) return [];
  const idx = nearestTimeIndex(times, timeIso);

  const out: { lat: number; lng: number; waveHeight: number }[] = [];
  for (const b of blocks) {
    const usedLat = typeof b?.latitude === "number" ? b.latitude : null;
    const usedLng = typeof b?.longitude === "number" ? b.longitude : null;
    const arr = b?.hourly?.wave_height as number[] | undefined;
    const v = typeof arr?.[idx] === "number" ? arr[idx] : NaN;
    if (!Number.isFinite(v) || usedLat == null || usedLng == null) continue;
    out.push({ lat: usedLat, lng: usedLng, waveHeight: v });
  }
  if (!out.length && points.length > 1) {
    const c = points[Math.floor(points.length / 2)]!;
    return openMeteoWaveGridPoints([c], timeIso, signal);
  }
  return out;
}
