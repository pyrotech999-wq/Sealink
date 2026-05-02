const KM_PER_MI = 1.609344;

/** Great-circle distance in kilometres (same model as {@link distanceMiles}). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return distanceMiles(lat1, lon1, lat2, lon2) * KM_PER_MI;
}

/** Great-circle distance in miles (WGS84 mean Earth radius). */
export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const r1 = (lat1 * Math.PI) / 180;
  const r2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(r1) * Math.cos(r2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Initial bearing in degrees from point A to B (0..360, where 0 = north). */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r1 = (lat1 * Math.PI) / 180;
  const r2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(r2);
  const x = Math.cos(r1) * Math.sin(r2) - Math.sin(r1) * Math.cos(r2) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(((a - b + 540) % 360) - 180);
  return d;
}

/** Great-circle distance in metres (WGS84). */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return distanceKm(lat1, lon1, lat2, lon2) * 1000;
}
