const KEY = "sealink_map_last_geo_v1";

export type LastKnownGeo = { lat: number; lng: number; ts: number };

export function recordLastKnownPosition(lat: number, lng: number): void {
  if (typeof window === "undefined") return;
  try {
    const payload: LastKnownGeo = { lat, lng, ts: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
}

/** Last GPS used on the map while sharing; used for off-home broadcast toasts. */
export function getLastKnownPosition(maxAgeMs = 30 * 60 * 1000): LastKnownGeo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as LastKnownGeo;
    if (typeof j.lat !== "number" || typeof j.lng !== "number" || typeof j.ts !== "number") return null;
    if (Date.now() - j.ts > maxAgeMs) return null;
    return j;
  } catch {
    return null;
  }
}
