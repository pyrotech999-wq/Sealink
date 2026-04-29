/** One hour of fields used to ground the AI 48h outlook. */
export type HourlyContextPoint = {
  time: string;
  tempC: number;
  rainMm: number;
  wmo: number;
  rh: number;
  dewC: number;
  hPa: number;
  windMph: number;
  windDir: number;
};

type OpenMeteoHourly = {
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation?: number[];
    weather_code?: number[];
    relative_humidity_2m?: number[];
    dew_point_2m?: number[];
    pressure_msl?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
  };
};

function num(v: unknown): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}

/** First 48 hours of hourly forecast at the point (Open-Meteo). */
export async function fetch48hHourlyContext(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<HourlyContextPoint[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation,weather_code,relative_humidity_2m,dew_point_2m,pressure_msl,wind_speed_10m,wind_direction_10m",
  );
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("temperature_unit", "celsius");

  const res = await fetch(url.toString(), { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Open-Meteo hourly failed (${res.status})`);

  const data = (await res.json()) as OpenMeteoHourly;
  const t = data.hourly?.time ?? [];
  const T = data.hourly?.temperature_2m ?? [];
  const P = data.hourly?.precipitation ?? [];
  const W = data.hourly?.weather_code ?? [];
  const H = data.hourly?.relative_humidity_2m ?? [];
  const D = data.hourly?.dew_point_2m ?? [];
  const M = data.hourly?.pressure_msl ?? [];
  const S = data.hourly?.wind_speed_10m ?? [];
  const Dir = data.hourly?.wind_direction_10m ?? [];

  const out: HourlyContextPoint[] = [];
  const n = Math.min(48, t.length);
  for (let i = 0; i < n; i++) {
    const time = t[i];
    if (!time) continue;
    out.push({
      time,
      tempC: num(T[i]),
      rainMm: num(P[i]),
      wmo: num(W[i]),
      rh: num(H[i]),
      dewC: num(D[i]),
      hPa: num(M[i]),
      windMph: num(S[i]),
      windDir: num(Dir[i]),
    });
  }
  return out;
}

/** Reduce token use: every 3rd hour for the model prompt. */
export function sampleEvery3Hours(points: HourlyContextPoint[]): HourlyContextPoint[] {
  return points.filter((_, i) => i % 3 === 0);
}
