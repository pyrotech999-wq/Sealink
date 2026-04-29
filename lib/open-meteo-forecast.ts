export type DailyWindMax = {
  /** ISO date yyyy-mm-dd */
  date: string;
  /** Daily maximum 10 m wind, mph */
  maxMph: number;
};

type OpenMeteoDaily = {
  daily?: {
    time?: string[];
    wind_speed_10m_max?: number[];
  };
};

export async function fetchSevenDayMaxWindMph(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<DailyWindMax[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("daily", "wind_speed_10m_max");
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString(), { signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Forecast request failed (${res.status})`);
  }

  const data = (await res.json()) as OpenMeteoDaily;
  const times = data.daily?.time ?? [];
  const speeds = data.daily?.wind_speed_10m_max ?? [];

  return times.map((date, i) => {
    const raw = speeds[i];
    const maxMph = typeof raw === "number" && !Number.isNaN(raw) ? raw : 0;
    return { date, maxMph };
  });
}
