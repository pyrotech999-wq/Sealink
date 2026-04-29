import type { HourlyContextPoint } from "@/lib/open-meteo-ai-context";
import { wmoWeatherLabel } from "@/lib/wmo-weather";

function dominantWmo(points: HourlyContextPoint[]): number {
  const counts = new Map<number, number>();
  for (const p of points) {
    const c = Math.round(p.wmo);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best = 0;
  let bestN = -1;
  for (const [code, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = code;
    }
  }
  return best;
}

/** Plain-language 48h-style summary from the same hourly sample the GPT route uses (no LLM). */
export function buildHeuristic48hOutlook(points: HourlyContextPoint[]): string {
  if (!points.length) {
    return "No hourly forecast data was returned for this point. Try again later.\n\nThis is automated model output, not a substitute for official shipping forecasts or your own judgement.";
  }

  const temps = points.map((p) => p.tempC);
  const tMin = Math.min(...temps);
  const tMax = Math.max(...temps);
  const sumRain = points.reduce((s, p) => s + p.rainMm, 0);
  const maxWind = Math.max(...points.map((p) => p.windMph));
  const rhAvg = points.reduce((s, p) => s + p.rh, 0) / points.length;
  const p0 = points[0]?.hPa ?? 0;
  const pL = points[points.length - 1]?.hPa ?? 0;
  const dp = pL - p0;
  let pressurePhrase = "pressure is fairly steady in the sample.";
  if (dp > 2) pressurePhrase = "pressure edges upward through the sample — often a sign of more settled air.";
  else if (dp < -2) pressurePhrase = "pressure trends downward — worth watching for more unsettled conditions.";

  const wmo = dominantWmo(points);
  const sky = wmoWeatherLabel(wmo);

  const rainPhrase =
    sumRain < 0.3
      ? "Rain amounts in the sampled hours stay light."
      : `Precipitation in the sampled hours totals roughly ${Math.round(sumRain * 10) / 10} mm — pack for wet spells.`;

  const comfort =
    rhAvg > 78
      ? "Humidity is often quite high, so it may feel close or muggy at times."
      : "Humidity looks moderate for much of the window.";

  return (
    `Using Open-Meteo hourly data (3-hour steps, next ~48h) for your position: air temperatures in the sample range about ${Math.round(tMin)}–${Math.round(tMax)} °C. ` +
    `The dominant weather pattern reads as “${sky}”. ${rainPhrase} Peak wind in the sample is near ${Math.round(maxWind)} mph. ${comfort} Mean sea-level ${pressurePhrase}\n\n` +
    `This paragraph is a fixed, pattern-based read of the same grid the AI outlook uses — add OPENAI_API_KEY for a richer GPT summary. It is automated model guidance only, not a substitute for official shipping forecasts or your own judgement on board.`
  );
}
