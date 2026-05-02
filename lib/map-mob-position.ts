import { humanGeolocationMessage } from "@/lib/geolocation-utils";
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
      (err) => {
        if (fallback) resolve({ lat: fallback.lat, lng: fallback.lng });
        else reject(new Error(`${humanGeolocationMessage(err)} Or set your position on the map first.`));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 40_000 },
    );
  });
}
