import { getAnchorGeofenceConfig } from "@/lib/anchor-geofence-store";
import { getAnchorMonitorConfig, type AnchorMonitorConfig } from "@/lib/anchor-monitor-store";
import { effectiveMonitorDeviceIdFromServer } from "@/lib/anchor-reset-centre-client";
import type { AnchorGeofenceConfigRow } from "@/lib/anchor-geofence-store";

function defaultMonitorRow(uid: string): AnchorMonitorConfig {
  const now = new Date().toISOString();
  return { uid, monitorDeviceId: null, alertDeviceIds: [], updatedAt: now };
}

function defaultGeofenceRow(uid: string): AnchorGeofenceConfigRow {
  return {
    uid,
    armed: false,
    lat: null,
    lng: null,
    radiusM: 20,
    angleDeg: 360,
    monitorDeviceId: "this",
    lastBearingDeg: null,
    lastAlertAt: null,
    remoteAlarmSilencedUntilReset: false,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Effective monitoring handset id for this account (server monitor row wins, else geofence monitor id).
 * Uses `Promise.allSettled` so one store failing (e.g. transient Supabase error) does not kill the whole poll.
 */
export async function getEffectiveMonitorDeviceIdForUid(uid: string): Promise<string | null> {
  const [monRes, geoRes] = await Promise.allSettled([getAnchorMonitorConfig(uid), getAnchorGeofenceConfig(uid)]);

  if (monRes.status === "rejected") {
    console.error("[getEffectiveMonitorDeviceIdForUid] getAnchorMonitorConfig failed", monRes.reason);
  }
  if (geoRes.status === "rejected") {
    console.error("[getEffectiveMonitorDeviceIdForUid] getAnchorGeofenceConfig failed", geoRes.reason);
  }

  const monitor = monRes.status === "fulfilled" ? monRes.value : defaultMonitorRow(uid);
  const geo = geoRes.status === "fulfilled" ? geoRes.value : defaultGeofenceRow(uid);

  return effectiveMonitorDeviceIdFromServer({
    serverMonitorDeviceId: monitor.monitorDeviceId,
    geofenceMonitorDeviceId: geo.monitorDeviceId,
  });
}
