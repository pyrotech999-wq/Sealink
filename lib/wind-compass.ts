/** Meteorological wind: degrees **from** which wind blows (0 = N). */
export function downwindBearingDeg(fromDeg: number): number {
  const from = ((fromDeg % 360) + 360) % 360;
  return (from + 180) % 360;
}

/** 16-point compass for "from" direction. */
export function windFromCompass16(fromDeg: number): string {
  const names = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const from = ((fromDeg % 360) + 360) % 360;
  const idx = Math.round(from / 22.5) % 16;
  return names[idx] ?? "N";
}
