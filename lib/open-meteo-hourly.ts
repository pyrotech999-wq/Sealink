export type HourlyWindSlot = {
  /** ISO instant from Open-Meteo (timezone=auto) */
  at: string;
  mph: number;
  /** Degrees, direction wind blows *from* (met convention) */
  dirFromDeg: number;
  /** Wind gust in mph */
  gustMph: number;
  /** Sea state description (e.g., "Rough seas developing") */
  seaStateDescription?: string;
};

type OpenMeteoHourly = {
  hourly?: {
    time?: string[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
    wind_gusts_10m?: number[];
  };
};

/**
 * 7 days of hourly wind, then one row every **3 hours** (indices 0, 3, 6, …).
 */
export async function fetchWindSlotsEvery3h(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<HourlyWindSlot[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m,wind_gusts_10m");
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString(), { signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Hourly wind request failed (${res.status})`);
  }

  const data = (await res.json()) as OpenMeteoHourly;
  const times = data.hourly?.time ?? [];
  const speeds = data.hourly?.wind_speed_10m ?? [];
  const dirs = data.hourly?.wind_direction_10m ?? [];
  const gusts = data.hourly?.wind_gusts_10m ?? [];

  const out: HourlyWindSlot[] = [];
  for (let i = 0; i < times.length; i += 3) {
    const at = times[i];
    if (!at) continue;
    const rawM = speeds[i];
    const rawD = dirs[i];
    const rawG = gusts[i];
    const mph = typeof rawM === "number" && !Number.isNaN(rawM) ? rawM : 0;
    const dirFromDeg = typeof rawD === "number" && !Number.isNaN(rawD) ? rawD : 0;
    const gustMph = typeof rawG === "number" && !Number.isNaN(rawG) ? rawG : 0;
    out.push({ at, mph, dirFromDeg, gustMph });
  }
  return out;
}

export function nearestSlotIndex(slots: HourlyWindSlot[], nowMs: number = Date.now()): number {
  if (!slots.length) return 0;
  let best = 0;
  let bestDiff = Infinity;
  slots.forEach((s, i) => {
    const t = new Date(s.at).getTime();
    const d = Math.abs(t - nowMs);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  });
  return best;
}