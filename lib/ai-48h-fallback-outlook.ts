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

/** Natural 48h-style summary from Open-Meteo hourly points (no LLM). */
export function buildHeuristic48hOutlook(points: HourlyContextPoint[]): string {
  if (!points.length) {
    return "We couldn’t load hourly forecast data for this spot just now. Please try again in a little while.\n\nRemember: model output is not a substitute for official shipping forecasts or your own judgement.";
  }

  const temps = points.map((p) => p.tempC);
  const tMin = Math.round(Math.min(...temps));
  const tMax = Math.round(Math.max(...temps));
  const sumRain = points.reduce((s, p) => s + p.rainMm, 0);
  const maxWind = Math.round(Math.max(...points.map((p) => p.windMph)));
  const rhAvg = points.reduce((s, p) => s + p.rh, 0) / points.length;
  const p0 = points[0]?.hPa ?? 0;
  const pL = points[points.length - 1]?.hPa ?? 0;
  const dp = pL - p0;

  let pressureBit =
    "Air pressure is holding fairly steady, which usually means no dramatic swing in the pattern.";
  if (dp > 2) {
    pressureBit =
      "Air pressure is creeping up a little — that often goes with calmer, more settled conditions.";
  } else if (dp < -2) {
    pressureBit =
      "Air pressure is easing downward — worth keeping an eye out in case things turn more unsettled.";
  }

  const wmo = dominantWmo(points);
  const skyBit = (() => {
    const c = Math.round(wmo);
    if (c <= 1) return "Skies should stay mostly clear or fine.";
    if (c === 2) return "Expect a mix of sun and cloud.";
    if (c === 3) return "It’s often cloudy or overcast.";
    if (c === 45 || c === 48) return "Fog or very low cloud is possible at times.";
    if (c >= 51 && c <= 67) return "Wet weather is in the picture.";
    if (c >= 71 && c <= 77) return "Cold enough for sleet or snow in the mix.";
    if (c >= 80 && c <= 82) return "Showery spells are likely.";
    if (c >= 85 && c < 95) return "Wintry showers are possible.";
    if (c >= 95) return "Thundery downpours can’t be ruled out.";
    return `Broadly, conditions look like “${wmoWeatherLabel(wmo)}”.`;
  })();

  const rainBit =
    sumRain < 0.3
      ? "Rain looks light or patchy at worst."
      : `Rain could add up to around ${Math.round(sumRain * 10) / 10} mm — keep waterproofs handy.`;

  const humidityBit =
    rhAvg > 78
      ? "Humidity is on the high side, so it may feel a bit close."
      : "Humidity looks fairly comfortable for much of the time.";

  const body =
    `Over the next day or two, Open-Meteo’s hourly run for your position suggests about ${tMin}–${tMax} °C. ${skyBit} ${rainBit} ` +
    `Winds may reach roughly ${maxWind} mph at times. ${humidityBit} ${pressureBit}`;

  const footer =
    "\n\nThis is automated guidance from weather models only — not a substitute for official shipping forecasts or your own judgement on board.";

  return body + footer;
}
