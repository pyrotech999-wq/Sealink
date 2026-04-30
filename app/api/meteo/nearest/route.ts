import { NextResponse } from "next/server";

export const runtime = "nodejs";

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

type MeteoReading = {
  timeIso: string | null;
  tempC: number | null;
  windKph: number | null;
  windDirDeg: number | null;
  gustKph: number | null;
  pressureHpa: number | null;
  precipMm: number | null;
};

type MeteoStation = {
  id: string;
  name: string | null;
  country: string | null;
  distanceM: number | null;
  lat: number | null;
  lon: number | null;
};

function pickStationName(name: unknown): string | null {
  if (!name) return null;
  if (typeof name === "string") return name;
  if (typeof name === "object") {
    const o = name as Record<string, unknown>;
    const en = o.en;
    if (typeof en === "string" && en) return en;
    for (const v of Object.values(o)) {
      if (typeof v === "string" && v) return v;
    }
  }
  return null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function meteostatNearest(
  coords: { lat: number; lng: number },
  key: string,
): Promise<{ station: MeteoStation; reading: MeteoReading; source: "meteostat" } | null> {
  const host = "meteostat.p.rapidapi.com";
  const base = "https://meteostat.p.rapidapi.com";
  const headers = {
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": host,
  };

  const nearby = new URL(`${base}/stations/nearby`);
  nearby.searchParams.set("lat", String(coords.lat));
  nearby.searchParams.set("lon", String(coords.lng));
  nearby.searchParams.set("limit", "1");
  nearby.searchParams.set("radius", "200000");

  const nr = await fetch(nearby.toString(), { headers, cache: "no-store" });
  if (!nr.ok) return null;
  const nj = (await nr.json()) as unknown;
  const data = nj && typeof nj === "object" ? (nj as Record<string, unknown>).data : null;
  if (!Array.isArray(data) || !data.length) return null;
  const st = data[0] as Record<string, unknown>;
  const station: MeteoStation = {
    id: typeof st.id === "string" ? st.id : "",
    name: pickStationName(st.name),
    country: typeof st.country === "string" ? st.country : null,
    distanceM: num(st.distance),
    lat: num(st.latitude),
    lon: num(st.longitude),
  };
  if (!station.id) return null;

  const end = new Date();
  const start = new Date(end.getTime() - 36 * 60 * 60 * 1000);
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);

  const hourly = new URL(`${base}/stations/hourly`);
  hourly.searchParams.set("station", station.id);
  hourly.searchParams.set("start", isoDay(start));
  hourly.searchParams.set("end", isoDay(end));
  hourly.searchParams.set("tz", "UTC");

  const hr = await fetch(hourly.toString(), { headers, cache: "no-store" });
  if (!hr.ok) return { station, reading: { timeIso: null, tempC: null, windKph: null, windDirDeg: null, gustKph: null, pressureHpa: null, precipMm: null }, source: "meteostat" };
  const hj = (await hr.json()) as unknown;
  const hdata = hj && typeof hj === "object" ? (hj as Record<string, unknown>).data : null;
  if (!Array.isArray(hdata) || !hdata.length) {
    return { station, reading: { timeIso: null, tempC: null, windKph: null, windDirDeg: null, gustKph: null, pressureHpa: null, precipMm: null }, source: "meteostat" };
  }

  const last = hdata[hdata.length - 1] as Record<string, unknown>;
  const reading: MeteoReading = {
    timeIso: typeof last.time === "string" ? last.time : null,
    tempC: num(last.temp),
    windKph: num(last.wspd) != null ? (num(last.wspd)! * 3.6) : null, // m/s -> kph
    windDirDeg: num(last.wdir),
    gustKph: num(last.wpgt) != null ? (num(last.wpgt)! * 3.6) : null, // m/s -> kph
    pressureHpa: num(last.pres),
    precipMm: num(last.prcp),
  };

  return { station, reading, source: "meteostat" };
}

async function openMeteoFallback(
  coords: { lat: number; lng: number },
): Promise<{ station: MeteoStation; reading: MeteoReading; source: "open-meteo-model" } | null> {
  const api = new URL("https://api.open-meteo.com/v1/forecast");
  api.searchParams.set("latitude", String(coords.lat));
  api.searchParams.set("longitude", String(coords.lng));
  api.searchParams.set(
    "current",
    [
      "temperature_2m",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "pressure_msl",
      "precipitation",
    ].join(","),
  );
  api.searchParams.set("timezone", "auto");
  api.searchParams.set("wind_speed_unit", "kmh");

  const r = await fetch(api.toString(), { cache: "no-store" });
  if (!r.ok) return null;
  const j = (await r.json()) as any;
  const c = j?.current ?? null;
  const t = typeof c?.time === "string" ? c.time : null;
  const reading: MeteoReading = {
    timeIso: t,
    tempC: num(c?.temperature_2m),
    windKph: num(c?.wind_speed_10m),
    windDirDeg: num(c?.wind_direction_10m),
    gustKph: num(c?.wind_gusts_10m),
    pressureHpa: num(c?.pressure_msl),
    precipMm: num(c?.precipitation),
  };

  const station: MeteoStation = {
    id: "model",
    name: "Nearest model grid (Open‑Meteo)",
    country: null,
    distanceM: null,
    lat: coords.lat,
    lon: coords.lng,
  };
  return { station, reading, source: "open-meteo-model" };
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const coords = clampLatLng(lat, lng);
  if (!coords) return NextResponse.json({ error: "lat and lng required" }, { status: 400 });

  const key = process.env.METEOSTAT_RAPIDAPI_KEY;
  try {
    if (typeof key === "string" && key.trim()) {
      const got = await meteostatNearest(coords, key.trim());
      if (got) return NextResponse.json({ ok: true, ...got });
    }
    const fb = await openMeteoFallback(coords);
    if (fb) return NextResponse.json({ ok: true, ...fb });
    return NextResponse.json({ error: "No meteo data available" }, { status: 502 });
  } catch {
    // If RapidAPI blocks/fails, still try fallback once.
    const fb = await openMeteoFallback(coords);
    if (fb) return NextResponse.json({ ok: true, ...fb });
    return NextResponse.json({ error: "Meteo request failed" }, { status: 502 });
  }
}

