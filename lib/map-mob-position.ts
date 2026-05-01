import { getLastKnownPosition } from "@/lib/map-last-known";

/** GPS for MOB / cancel: current fix, or last known within 2h. */
export function getMobPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    const fallback = getLastKnownPosition(2 * 60 * 60 * 1000);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      if (fallback) resolve({ lat: fallback.lat, lng: fallback.lng });
      else reject(new Error("Location not available"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {
        if (fallback) resolve({ lat: fallback.lat, lng: fallback.lng });
        else reject(new Error("Could not get GPS. Allow location or use the map to fix position first."));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 25_000 },
    );
  });
}
