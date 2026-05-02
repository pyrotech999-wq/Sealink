/** User-facing copy for GeolocationPositionError codes (1–3). */
export function humanGeolocationMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location is blocked. Allow location for this site in your browser or OS settings.";
    case err.POSITION_UNAVAILABLE:
      return "No GPS fix yet. Try open sky, wait a few seconds, or check location services are on.";
    case err.TIMEOUT:
      return "GPS timed out. Move to a clearer view of the sky or try again.";
    default:
      return err.message?.trim() || "Location error";
  }
}

export function clampGeoAccuracyM(accuracy: number | null | undefined, minM = 8, maxM = 1200): number {
  return Math.min(Math.max(accuracy || 0, minM), maxM);
}
