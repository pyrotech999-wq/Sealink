/**
 * Build Wetterzentrale "Top Karten" URLs for GFS-style synoptic charts.
 * Same parameter style as FloodWarn’s chart hub: https://floodwarn.co.uk/naeweathercharts.htm
 *
 * Note: NOAA’s atmospheric charts use model=gfs. Significant wave height / sea-state
 * maps on Wetterzentrale use model=gwes (GFS-based global wave system).
 */

export type WzChartKind = "pressure" | "precipitation" | "wind" | "waves";
export type WzRegion = "global" | "europe";
export type GfsRunHour = 0 | 6 | 12 | 18;

/** Forecast lead time in hours from the selected run (GFS OP on WZ uses 6-hour steps in this mode). */
export const WZ_FORECAST_STEP_H = 6;
export const WZ_MAX_FORECAST_H_5D = 120;

const WZ_TOPKARTEN_EN = "https://www.wetter-zentrale.de/en/topkarten.php";

function mapId(region: WzRegion): number {
  return region === "global" ? 32 : 1;
}

export function chartKindMeta(kind: WzChartKind): { model: "gfs" | "gwes"; varId: number; label: string; note?: string } {
  switch (kind) {
    case "pressure":
      return { model: "gfs", varId: 1, label: "500 hPa + MSLP" };
    case "precipitation":
      return { model: "gfs", varId: 4, label: "Precipitation (1 h)" };
    case "wind":
      return { model: "gfs", varId: 9, label: "10 m wind (speed + direction)" };
    case "waves":
      return {
        model: "gwes",
        varId: 52,
        label: "Significant wave height",
        note: "GWES is NOAA’s global wave system run alongside GFS (not the atmospheric GFS map alone).",
      };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Clamp forecast hour to [0, max] and snap to 6-hour steps. */
export function snapForecastHours(h: number, max = WZ_MAX_FORECAST_H_5D): number {
  const s = Math.round(h / WZ_FORECAST_STEP_H) * WZ_FORECAST_STEP_H;
  return Math.max(0, Math.min(max, s));
}

/**
 * Rough default for which GFS run is usually complete (UTC). User can override (00/06/12/18Z).
 */
export function guessLatestGfsRunUtc(): GfsRunHour {
  const uh = new Date().getUTCHours();
  if (uh < 5) return 12;
  if (uh < 11) return 6;
  if (uh < 17) return 12;
  return 18;
}

export function buildWetterzentraleChartUrl(opts: {
  kind: WzChartKind;
  region: WzRegion;
  run: GfsRunHour;
  forecastHours: number;
}): string {
  const { model, varId } = chartKindMeta(opts.kind);
  const time = snapForecastHours(opts.forecastHours);
  const params = new URLSearchParams({
    map: String(mapId(opts.region)),
    model,
    var: String(varId),
    run: String(opts.run),
    time: String(time),
    lid: "OP",
    h: "0",
    mv: "0",
    tr: String(WZ_FORECAST_STEP_H),
  });
  return `${WZ_TOPKARTEN_EN}?${params.toString()}#mapref`;
}

export const FLOODWARN_CHART_HUB_URL = "https://floodwarn.co.uk/naeweathercharts.htm";
