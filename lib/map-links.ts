/** Google Maps URL for a WGS84 point (same format as MOB API body). */
export function googleMapsUrlForLatLng(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** First http(s) URL in text that looks like a map link. */
export function firstMapUrlInText(text: string): string | null {
  const re = /https?:\/\/[^\s<>]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const lower = raw.toLowerCase();
    if (
      lower.includes("google.com/maps") ||
      lower.includes("maps.google") ||
      lower.includes("goo.gl/maps") ||
      lower.includes("maps.apple.com")
    ) {
      return raw;
    }
  }
  return null;
}

/** Prefer API coordinates; fall back to parsing the message body (older rows). */
export function mapHrefPreferCoords(body: string, lat?: unknown, lng?: unknown): string | null {
  if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
    return googleMapsUrlForLatLng(lat, lng);
  }
  return firstMapUrlInText(body);
}
