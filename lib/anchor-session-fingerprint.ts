import type { AnchorGeofenceConfigRow } from "@/lib/anchor-geofence-store";

/**
 * Stable for the current armed anchor (same centre): remote commands queued while this ring is active
 * match what the monitor poll returns. Excludes radius so INCREASE_RADIUS does not orphan the queue.
 * RESET_ANCHOR changes lat/lng, so a new fingerprint naturally drops stale commands.
 */
export function buildAnchorSessionFingerprint(uid: string, geo: AnchorGeofenceConfigRow): string | null {
  if (!geo.armed) return null;
  const lat = geo.lat;
  const lng = geo.lng;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${uid}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
}
