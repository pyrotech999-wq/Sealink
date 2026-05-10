import { getAnchorGeofenceConfig } from "@/lib/anchor-geofence-store";
import { getAnchorMonitorConfig } from "@/lib/anchor-monitor-store";
import { effectiveMonitorDeviceIdFromServer } from "@/lib/anchor-reset-centre-client";

/** Effective monitoring handset id for this account (server monitor row wins, else geofence monitor id). */
export async function getEffectiveMonitorDeviceIdForUid(uid: string): Promise<string | null> {
  const [monitor, geo] = await Promise.all([getAnchorMonitorConfig(uid), getAnchorGeofenceConfig(uid)]);
  return effectiveMonitorDeviceIdFromServer({
    serverMonitorDeviceId: monitor.monitorDeviceId,
    geofenceMonitorDeviceId: geo.monitorDeviceId,
  });
}
