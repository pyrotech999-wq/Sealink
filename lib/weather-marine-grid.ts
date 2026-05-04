import type { Map } from "leaflet";

/** Must match server `MAX_POINTS` in `/api/weather/stormglass-grid` for combined layer. */
export const MARINE_GRID_MAX_POINTS = 24;

/**
 * Fixed 6×4 viewport grid (24 points) for one combined Stormglass + Open‑Meteo marine request per debounced map state.
 */
export function buildMarineSampleGrid(map: Map): {
  points: { lat: number; lng: number }[];
  cols: number;
  rows: number;
  boundsKey: string;
} {
  const b = map.getBounds();
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  const cols = 6 as number;
  const rows = 4 as number;
  const points: { lat: number; lng: number }[] = [];
  for (let y = 0; y < rows; y++) {
    const fy = rows <= 1 ? 0.5 : y / (rows - 1);
    const lat = sw.lat + (ne.lat - sw.lat) * fy;
    for (let x = 0; x < cols; x++) {
      const fx = cols <= 1 ? 0.5 : x / (cols - 1);
      const lng = sw.lng + (ne.lng - sw.lng) * fx;
      points.push({ lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) });
    }
  }
  const boundsKey = `${sw.lat.toFixed(2)},${sw.lng.toFixed(2)},${ne.lat.toFixed(2)},${ne.lng.toFixed(2)}`;
  return { points, cols, rows, boundsKey };
}
