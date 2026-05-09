import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

export type AnchorMonitoringPermissionStatus = {
  fineLocation: boolean;
  postNotifications: boolean;
  backgroundLocation: boolean;
};

type NativeAnchorBreachPayload = { message?: string };

export type SeaLinkAnchorAlertPlugin = {
  requestPostNotifications(): Promise<{ status: string }>;
  requestBackgroundLocation(): Promise<{ status: string }>;
  startMonitoring(opts: {
    anchorLat: number;
    anchorLng: number;
    radiusM: number;
    angleDeg: number;
    lastBearingDeg?: number | null;
  }): Promise<void>;
  stopMonitoring(): Promise<void>;
  getMonitoringPermissionStatus(): Promise<AnchorMonitoringPermissionStatus>;
  addListener(
    eventName: "nativeAnchorBreach",
    listener: (info: NativeAnchorBreachPayload) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
};

const SeaLinkAnchorAlert = registerPlugin<SeaLinkAnchorAlertPlugin>("SeaLinkAnchorAlert", {
  web: () => ({
    requestPostNotifications: async () => ({ status: "unneeded" }),
    requestBackgroundLocation: async () => ({ status: "unneeded" }),
    startMonitoring: async () => undefined,
    stopMonitoring: async () => undefined,
    getMonitoringPermissionStatus: async () => ({
      fineLocation: true,
      postNotifications: true,
      backgroundLocation: true,
    }),
    addListener: async () => ({ remove: async () => undefined }),
    removeAllListeners: async () => undefined,
  }),
});

export function isCapacitorAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function requestAndroidAnchorMonitoringPermissions(): Promise<{ ok: boolean; reason?: string }> {
  if (!isCapacitorAndroidNative()) return { ok: true };
  const post = await SeaLinkAnchorAlert.requestPostNotifications();
  if (post.status === "denied") return { ok: false, reason: "notifications" };
  const bg = await SeaLinkAnchorAlert.requestBackgroundLocation();
  if (bg.status === "denied") return { ok: false, reason: "background_location" };
  return { ok: true };
}

export async function startAndroidAnchorForegroundMonitoring(args: {
  monitorDeviceId: string;
  deviceId: string;
  lat: number;
  lng: number;
  radiusM: number;
  angleDeg: number;
  lastBearingDeg?: number | null;
}): Promise<void> {
  if (!isCapacitorAndroidNative()) return;
  const monitorsThisDevice =
    args.monitorDeviceId === "this" || args.monitorDeviceId === args.deviceId || args.monitorDeviceId === "";
  if (!monitorsThisDevice) return;
  await SeaLinkAnchorAlert.startMonitoring({
    anchorLat: args.lat,
    anchorLng: args.lng,
    radiusM: args.radiusM,
    angleDeg: args.angleDeg,
    ...(args.lastBearingDeg != null && Number.isFinite(args.lastBearingDeg)
      ? { lastBearingDeg: args.lastBearingDeg }
      : {}),
  });
}

export async function stopAndroidAnchorNativeMonitoringIfNeeded(): Promise<void> {
  if (!isCapacitorAndroidNative()) return;
  await SeaLinkAnchorAlert.stopMonitoring();
}

export async function getAndroidAnchorMonitoringPermissionStatus(): Promise<AnchorMonitoringPermissionStatus> {
  if (!isCapacitorAndroidNative()) {
    return { fineLocation: true, postNotifications: true, backgroundLocation: true };
  }
  return SeaLinkAnchorAlert.getMonitoringPermissionStatus();
}

export { SeaLinkAnchorAlert };
