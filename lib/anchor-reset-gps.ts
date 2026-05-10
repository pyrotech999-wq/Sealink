export type LatLng = { lat: number; lng: number };

function validLatLng(p: LatLng | null | undefined): p is LatLng {
  return (
    p != null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

/**
 * Resolves coordinates for “reset anchor here”: prefers the live map fix, then a one-shot browser GPS read
 * (so receiving devices without the map open can still reset using this handset’s position).
 */
export async function getGpsFixForAnchorReset(mapPos: LatLng | null): Promise<LatLng | null> {
  if (validLatLng(mapPos)) return mapPos;
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        resolve(validLatLng({ lat, lng }) ? { lat, lng } : null);
      },
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 25_000 },
    );
  });
}
