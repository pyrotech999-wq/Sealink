export type CurrentSnippet = {
  tempC: number;
  wmo: number;
  precipMm: number;
  windMph: number;
  mood: "good" | "ok" | "rough";
};

function num(v: unknown): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}

/** Rough buckets for narrative tone (not navigation). */
export function weatherMoodFromCurrent(wmo: number, precipMm: number, windMph: number): CurrentSnippet["mood"] {
  if (windMph > 26) return "rough";
  if (wmo >= 61 && wmo <= 67) return "rough";
  if (wmo >= 80 && wmo <= 82) return "rough";
  if (wmo >= 95) return "rough";
  if (precipMm > 0.4) return "ok";
  if (wmo <= 2 && windMph <= 18) return "good";
  if (wmo <= 48 && windMph <= 22) return "ok";
  return "ok";
}

export async function fetchCurrentWeatherSnippet(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<CurrentSnippet | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", "temperature_2m,weather_code,precipitation,wind_speed_10m");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString(), { signal, cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    current?: {
      temperature_2m?: number;
      weather_code?: number;
      precipitation?: number;
      wind_speed_10m?: number;
    };
  };
  const c = data.current;
  if (!c) return null;

  const tempC = num(c.temperature_2m);
  const wmo = Math.round(num(c.weather_code));
  const precipMm = num(c.precipitation);
  const windMph = num(c.wind_speed_10m);
  return {
    tempC,
    wmo,
    precipMm,
    windMph,
    mood: weatherMoodFromCurrent(wmo, precipMm, windMph),
  };
}
