/** GPS Nautical Charts / i-Boating web viewer (third-party; own licence & coverage). */
export const IBOATING_MARINE_CHARTS_APP =
  "https://fishing-app.gpsnauticalcharts.com/i-boating-fishing-web-app/fishing-marine-charts-navigation.html";

/**
 * Build a viewer URL. Hash format matches public links such as
 * `#13.52/38.9735/1.3001/18.7` (zoom / lat / lng / fourth); we use `0` for the last field when unknown.
 */
export function iBoatingMarineChartsAppUrl(bounds: [[number, number], [number, number]] | null): string {
  if (!bounds) return IBOATING_MARINE_CHARTS_APP;
  const [[s, w], [n, e]] = bounds;
  const lat = (s + n) / 2;
  const lng = (w + e) / 2;
  const span = Math.max(Math.abs(n - s), Math.abs(e - w), 1e-9);
  let z = 10;
  if (span > 45) z = 4;
  else if (span > 25) z = 5;
  else if (span > 12) z = 6;
  else if (span > 6) z = 7;
  else if (span > 3) z = 8;
  else if (span > 1.5) z = 9;
  else if (span > 0.75) z = 10;
  else if (span > 0.35) z = 11;
  else if (span > 0.15) z = 12;
  else z = 13;
  return `${IBOATING_MARINE_CHARTS_APP}#${z.toFixed(2)}/${lat.toFixed(5)}/${lng.toFixed(5)}/0`;
}
