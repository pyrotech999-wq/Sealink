/**
 * Wetterzentrale GFS OP static map PNGs (same filenames as Top Karten).
 * Base: https://www.wetterzentrale.de/maps/GFSOP{REGION}{RUN}_{TIME}_{VAR}.png
 */

export type WzGfsMapRegionCode = "EU" | "NA" | "SA" | "AF" | "EA" | "SS" | "AU" | "MA" | "NH" | "SH";

export type WzGfsMapParam = "wind10m" | "temp2m" | "precip1h";

export type GfsRunHour = 0 | 6 | 12 | 18;

/** Forecast lead in hours; Top Karten uses `tr=3` for 3-hourly steps. */
export const WZ_GFS_MAP_STEP_H = 3;
export const WZ_GFS_MAP_MAX_H_3D = 72;

export const WZ_GFS_MAP_REGIONS: {
  code: WzGfsMapRegionCode;
  label: string;
  /** WZ does not publish 10 m wind PNGs for NH/SH on this product. */
  supports10mWind: boolean;
}[] = [
  { code: "EU", label: "Europe", supports10mWind: true },
  { code: "NA", label: "North America", supports10mWind: true },
  { code: "SA", label: "South America", supports10mWind: true },
  { code: "AF", label: "Africa", supports10mWind: true },
  { code: "EA", label: "Eastern Asia", supports10mWind: true },
  { code: "SS", label: "Southern Asia", supports10mWind: true },
  { code: "AU", label: "Australia / Oceania", supports10mWind: true },
  { code: "MA", label: "Middle America / Caribbean", supports10mWind: true },
  { code: "NH", label: "Northern Hemisphere", supports10mWind: false },
  { code: "SH", label: "Southern Hemisphere", supports10mWind: false },
];

const PARAM_VAR: Record<WzGfsMapParam, number> = {
  wind10m: 9,
  temp2m: 5,
  precip1h: 4,
};

export function wzGfsMapVarId(param: WzGfsMapParam): number {
  return PARAM_VAR[param];
}

export function buildWzGfsMapPngPath(opts: {
  region: WzGfsMapRegionCode;
  run: GfsRunHour;
  leadHours: number;
  param: WzGfsMapParam;
}): string {
  const run2 = String(opts.run).padStart(2, "0");
  const v = PARAM_VAR[opts.param];
  return `GFSOP${opts.region}${run2}_${opts.leadHours}_${v}.png`;
}

export function buildWzGfsMapPngUrl(opts: Parameters<typeof buildWzGfsMapPngPath>[0]): string {
  const path = buildWzGfsMapPngPath(opts);
  return `https://www.wetterzentrale.de/maps/${path}`;
}

export function snapLeadHours3h(h: number): number {
  const s = Math.round(h / WZ_GFS_MAP_STEP_H) * WZ_GFS_MAP_STEP_H;
  return Math.max(0, Math.min(WZ_GFS_MAP_MAX_H_3D, s));
}

export function isValidGfsRunHour(n: number): n is GfsRunHour {
  return n === 0 || n === 6 || n === 12 || n === 18;
}

/** Same heuristic as synoptic chart URL helper: pick a run likely to be posted. */
export function guessLatestGfsRunUtc(): GfsRunHour {
  const uh = new Date().getUTCHours();
  if (uh < 5) return 12;
  if (uh < 11) return 6;
  if (uh < 17) return 12;
  return 18;
}
