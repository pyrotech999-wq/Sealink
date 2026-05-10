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
 * Monitor + geofence rows in one parallel round-trip (no duplicate geofence read).
 * Uses `Promise.allSettled` so one store failing does not kill the other.
 */
export async function getEffectiveMonitorAndGeofence(uid: string): Promise<{
  effective: string | null;
  geo: AnchorGeofenceConfigRow;
}> {
  const [monRes, geoRes] = await Promise.allSettled([getAnchorMonitorConfig(uid), getAnchorGeofenceConfig(uid)]);

  if (monRes.status === "rejected") {
    console.error("[getEffectiveMonitorAndGeofence] getAnchorMonitorConfig failed", monRes.reason);
  }
  if (geoRes.status === "rejected") {
    console.error("[getEffectiveMonitorAndGeofence] getAnchorGeofenceConfig failed", geoRes.reason);
  }

  const monitor = monRes.status === "fulfilled" ? monRes.value : defaultMonitorRow(uid);
  const geo = geoRes.status === "fulfilled" ? geoRes.value : defaultGeofenceRow(uid);
  const effective = effectiveMonitorDeviceIdFromServer({
    serverMonitorDeviceId: monitor.monitorDeviceId,
    geofenceMonitorDeviceId: geo.monitorDeviceId,
  });
  return { effective, geo };
}

/**
 * Effective monitoring handset id for this account (server monitor row wins, else geofence monitor id).
 */
export async function getEffectiveMonitorDeviceIdForUid(uid: string): Promise<string | null> {
  const { effective } = await getEffectiveMonitorAndGeofence(uid);
  return effective;
}
