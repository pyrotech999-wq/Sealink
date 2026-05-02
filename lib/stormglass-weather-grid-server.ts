/**
 * Server-only helpers for Stormglass `/v2/weather/point` sampling used by the weather map grid API.
 */

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

export async function fetchStormglassHourRow(
  apiKey: string,
  lat: number,
  lng: number,
  timeIso: string,
  params: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  const start = new Date(timeIso);
  const end = new Date(start.getTime() + 36 * 60 * 60 * 1000);

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
    if (!r.ok) continue;
    const j = (await r.json()) as {
      hours?: { time: string; [k: string]: unknown }[];
      data?: { time: string; [k: string]: unknown }[];
    };
    const hours = j.hours ?? j.data;
    if (!Array.isArray(hours) || hours.length === 0) continue;
    const times = hours.map((h) => h.time);
    const i = nearestHourIndex(times, timeIso);
    return hours[i] ?? null;
  }
  return null;
}
