import { getGpsFixForAnchorReset } from "@/lib/anchor-reset-gps";

export type LatLng = { lat: number; lng: number };

/** Default cap for anchor reset fetches so the UI cannot spin forever on a hung request. */
export const ANCHOR_RESET_NETWORK_TIMEOUT_MS = 32_000;

export function createAnchorResetNetworkAbort(
  ms: number = ANCHOR_RESET_NETWORK_TIMEOUT_MS,
): { signal: AbortSignal; clear: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return {
    signal: c.signal,
    clear: () => clearTimeout(t),
  };
}

export function isAnchorResetAbortError(e: unknown): boolean {
  if (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") return true;
  return e !== null && typeof e === "object" && "name" in e && (e as { name?: string }).name === "AbortError";
}

function validMapPos(p: LatLng | null | undefined): p is LatLng {
  return (
    p != null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

/**
 * Coordinates for re‑arming the anchor geofence after a breach: **always** the monitoring device’s current
 * position (same radius). Uses this handset’s map fix only when this device **is** the monitor; otherwise
 * the monitoring unit’s last fix from `/api/anchor/devices`.
 */
export async function resolveAnchorResetCentreCoordinates(args: {
  thisDeviceId: string;
  /** Resolved monitoring device id (never `"this"` — pass real `deviceId` for local monitor). */
  effectiveMonitorDeviceId: string;
  /** Live map position when this device is the monitor; ignored otherwise. */
  mapPosIfThisDeviceIsMonitor: LatLng | null;
  /**
   * When false, never waits on one-shot browser geolocation (e.g. global breach overlay on a receiver).
   * Still uses `mapPosIfThisDeviceIsMonitor` when this handset is the monitor; otherwise falls through to `/api/anchor/devices`.
   */
  allowBrowserGpsFallback?: boolean;
  /** When set, passed to `/api/anchor/devices` so callers can bound wait time. */
  signal?: AbortSignal;
}): Promise<LatLng | null> {
  const {
    thisDeviceId,
    effectiveMonitorDeviceId,
    mapPosIfThisDeviceIsMonitor,
    allowBrowserGpsFallback = true,
    signal,
  } = args;

  let fix: LatLng | null = null;

  if (effectiveMonitorDeviceId === thisDeviceId) {
    if (validMapPos(mapPosIfThisDeviceIsMonitor)) {
      fix = mapPosIfThisDeviceIsMonitor;
    }
    if (!fix && allowBrowserGpsFallback) {
      fix = await getGpsFixForAnchorReset(null);
    }
  }

  if (!fix) {
    try {
      const r = await fetch("/api/anchor/devices", {
        credentials: "same-origin",
        cache: "no-store",
        ...(signal ? { signal } : {}),
      });
      if (!r.ok) return null;
      const d = (await r.json()) as {
        devices?: { deviceId: string; lastLat: number | null; lastLng: number | null }[];
      };
      const row = d.devices?.find((x) => x.deviceId === effectiveMonitorDeviceId);
      if (
        row &&
        typeof row.lastLat === "number" &&
        Number.isFinite(row.lastLat) &&
        typeof row.lastLng === "number" &&
        Number.isFinite(row.lastLng)
      ) {
        fix = { lat: row.lastLat, lng: row.lastLng };
      }
    } catch (e) {
      if (isAnchorResetAbortError(e)) throw e;
      return null;
    }
  }

  return fix;
}

/**
 * Canonical monitoring handset id from `anchor_monitor_config` or a concrete id on the geofence row.
 * Returns `null` when the geofence still has `"this"` but the server monitor row is unset (cannot know remotely).
 */
export function effectiveMonitorDeviceIdFromServer(args: {
  serverMonitorDeviceId: string | null | undefined;
  geofenceMonitorDeviceId: string | null | undefined;
}): string | null {
  const s = args.serverMonitorDeviceId;
  if (s != null && String(s).trim() !== "") return String(s).trim();
  const g = args.geofenceMonitorDeviceId ?? "this";
  if (typeof g === "string" && g !== "this" && g.trim() !== "") return g.trim();
  return null;
}

/** Same as server resolution, but `"this"` on geofence means this browser’s `deviceId` (Home map only). */
export function effectiveMonitorDeviceIdForHomeMap(args: {
  thisDeviceId: string;
  serverMonitorDeviceId: string | null | undefined;
  geofenceMonitorDeviceId: string | null | undefined;
}): string {
  const fromServer = effectiveMonitorDeviceIdFromServer(args);
  if (fromServer != null) return fromServer;
  const g = args.geofenceMonitorDeviceId ?? "this";
  return g === "this" ? args.thisDeviceId : g;
}
