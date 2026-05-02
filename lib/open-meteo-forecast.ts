export type DailyForecastRow = {
  date: string;
  maxMph: number;
  /** Degrees, direction wind blows *from* (met convention); daily dominant at 10 m. */
  windDirDominantDeg: number | null;
  wmo: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipMm: number | null;
  rainMm: number | null;
  precipProbMax: number | null;
  sunshineSec: number | null;
  rhMax: number | null;
  dewMaxC: number | null;
  pressureMslMax: number | null;
};

type OpenMeteoDaily = {
  daily?: Record<string, (string | number)[] | undefined> & {
    time?: string[];
  };
};

const DAILY_PARAM_TRIES = [
  "wind_speed_10m_max,wind_direction_10m_dominant,weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,precipitation_probability_max,sunshine_duration,dew_point_2m_max,relative_humidity_2m_max,pressure_msl_max",
  "wind_speed_10m_max,wind_direction_10m_dominant,weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,precipitation_probability_max,sunshine_duration",
] as const;

function num(v: unknown): number | null {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  return v;
}

function arr(d: OpenMeteoDaily["daily"], key: string): number[] | undefined {
  const v = d?.[key];
  return Array.isArray(v) ? (v as number[]) : undefined;
}

/** Number of daily steps requested from Open-Meteo for the home forecast strip. */
export const HOME_DAILY_FORECAST_DAYS = 8;

export async function fetchDailyForecast(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<DailyForecastRow[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("forecast_days", String(HOME_DAILY_FORECAST_DAYS));
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("timezone", "auto");

  let data: OpenMeteoDaily | null = null;
  for (const daily of DAILY_PARAM_TRIES) {
    url.searchParams.set("daily", daily);
    const res = await fetch(url.toString(), { signal, cache: "no-store" });
    if (res.ok) {
      data = (await res.json()) as OpenMeteoDaily;
      break;
    }
    if (res.status === 400) continue;
    throw new Error(`Forecast request failed (${res.status})`);
  }

  if (!data?.daily?.time?.length) {
    throw new Error("Forecast returned no daily rows");
  }

  const d = data.daily;
  const times = d.time ?? [];
  const speeds = arr(d, "wind_speed_10m_max") ?? [];
  const windDirs = arr(d, "wind_direction_10m_dominant") ?? [];
  const wmo = arr(d, "weather_code") ?? [];
  const tmax = arr(d, "temperature_2m_max") ?? [];
  const tmin = arr(d, "temperature_2m_min") ?? [];
  const precip = arr(d, "precipitation_sum") ?? [];
  const rain = arr(d, "rain_sum") ?? [];
  const prob = arr(d, "precipitation_probability_max") ?? [];
  const sun = arr(d, "sunshine_duration") ?? [];
  const rh = arr(d, "relative_humidity_2m_max") ?? [];
  const dew = arr(d, "dew_point_2m_max") ?? [];
  const pres = arr(d, "pressure_msl_max") ?? [];

  return times.map((date, i) => {
    const rawM = speeds[i];
    const maxMph = typeof rawM === "number" && !Number.isNaN(rawM) ? rawM : 0;
    return {
      date,
      maxMph,
      windDirDominantDeg: num(windDirs[i]),
      wmo: num(wmo[i]),
      tempMaxC: num(tmax[i]),
      tempMinC: num(tmin[i]),
      precipMm: num(precip[i]),
      rainMm: num(rain[i]),
      precipProbMax: num(prob[i]),
      sunshineSec: num(sun[i]),
      rhMax: num(rh[i]),
      dewMaxC: num(dew[i]),
      pressureMslMax: num(pres[i]),
    };
  });
}

/** @deprecated use fetchDailyForecast */
export const fetchSevenDayDailyForecast = fetchDailyForecast;

/** @deprecated use fetchDailyForecast — kept for any external imports */
export type DailyWindMax = { date: string; maxMph: number };

export async function fetchSevenDayMaxWindMph(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<DailyWindMax[]> {
  const rows = await fetchDailyForecast(lat, lng, signal);
  return rows.map((r) => ({ date: r.date, maxMph: r.maxMph }));
}
