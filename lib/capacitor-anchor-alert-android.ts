import { Capacitor, registerPlugin } from "@capacitor/core";

export type AnchorMonitoringPermissionStatus = {
  fineLocation: boolean;
  postNotifications: boolean;
  backgroundLocation: boolean;
};

export type NativeAnchorStatus = {
  alarmActive: boolean;
  anchorLat?: number;
  anchorLng?: number;
  radiusMeters: number;
  testMode: boolean;
  lastDistanceMeters?: number;
  driftAlarmPending: boolean;
  nativeAlarmPlaying: boolean;
  suppressUntilInside: boolean;
  lastAlarmMessage?: string;
  lastFixLat?: number;
  lastFixLng?: number;
  lastFixTimeMs: number;
};

export type NativeAnchorBreachPayload = { message?: string; fromNative?: boolean };

export type SeaLinkAnchorAlertPlugin = {
  requestPostNotifications(): Promise<{ status: string }>;
  requestBackgroundLocation(): Promise<{ status: string }>;
  startMonitoring(opts: {
    anchorLat: number;
    anchorLng: number;
    radiusM: number;
    angleDeg: number;
    lastBearingDeg?: number | null;
    testMode?: boolean;
  }): Promise<void>;
  stopMonitoring(): Promise<void>;
  getMonitoringPermissionStatus(): Promise<AnchorMonitoringPermissionStatus>;
  getNativeAnchorStatus(): Promise<NativeAnchorStatus>;
  clearNativeDriftAlarm(): Promise<NativeAnchorStatus>;
  setTestMode(opts: { enabled: boolean }): Promise<void>;
  addListener(eventName: string, listener: (info: unknown) => void): Promise<{ remove: () => Promise<void> }>;
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
    getNativeAnchorStatus: async () => ({
      alarmActive: false,
      anchorLat: Number.NaN,
      anchorLng: Number.NaN,
      radiusMeters: 0,
      testMode: false,
      lastDistanceMeters: Number.NaN,
      driftAlarmPending: false,
      nativeAlarmPlaying: false,
      suppressUntilInside: false,
      lastFixLat: Number.NaN,
      lastFixLng: Number.NaN,
      lastFixTimeMs: 0,
    }),
    clearNativeDriftAlarm: async () => ({
      alarmActive: false,
      anchorLat: Number.NaN,
      anchorLng: Number.NaN,
      radiusMeters: 0,
      testMode: false,
      lastDistanceMeters: Number.NaN,
      driftAlarmPending: false,
      nativeAlarmPlaying: false,
      suppressUntilInside: false,
      lastFixLat: Number.NaN,
      lastFixLng: Number.NaN,
      lastFixTimeMs: 0,
    }),
    setTestMode: async () => undefined,
    addListener: async () => ({ remove: async () => undefined }),
    removeAllListeners: async () => undefined,
  }),
});

const ANCHOR_ANDROID_TEST_MODE_KEY = "sealink_anchor_android_test_mode_v1";

export function readAnchorAndroidTestModeFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ANCHOR_ANDROID_TEST_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAnchorAndroidTestModeToStorage(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(ANCHOR_ANDROID_TEST_MODE_KEY, "1");
    else window.localStorage.removeItem(ANCHOR_ANDROID_TEST_MODE_KEY);
  } catch {
    /* ignore */
  }
}

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
  testMode?: boolean;
}): Promise<void> {
  if (!isCapacitorAndroidNative()) return;
  const monitorsThisDevice =
    args.monitorDeviceId === "this" || args.monitorDeviceId === args.deviceId || args.monitorDeviceId === "";
  if (!monitorsThisDevice) return;
  const testMode = args.testMode ?? readAnchorAndroidTestModeFromStorage();
  await SeaLinkAnchorAlert.startMonitoring({
    anchorLat: args.lat,
    anchorLng: args.lng,
    radiusM: args.radiusM,
    angleDeg: args.angleDeg,
    testMode,
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

export async function fetchNativeAnchorStatus(): Promise<NativeAnchorStatus> {
  if (!isCapacitorAndroidNative()) {
    return {
      alarmActive: false,
      anchorLat: Number.NaN,
      anchorLng: Number.NaN,
      radiusMeters: 0,
      testMode: false,
      lastDistanceMeters: Number.NaN,
      driftAlarmPending: false,
      nativeAlarmPlaying: false,
      suppressUntilInside: false,
      lastFixLat: Number.NaN,
      lastFixLng: Number.NaN,
      lastFixTimeMs: 0,
    };
  }
  return SeaLinkAnchorAlert.getNativeAnchorStatus();
}

export async function clearNativeAndroidAnchorAlarm(): Promise<NativeAnchorStatus> {
  if (!isCapacitorAndroidNative()) {
    return fetchNativeAnchorStatus();
  }
  return SeaLinkAnchorAlert.clearNativeDriftAlarm();
}

export async function setNativeAnchorTestMode(enabled: boolean): Promise<void> {
  writeAnchorAndroidTestModeToStorage(enabled);
  if (!isCapacitorAndroidNative()) return;
  await SeaLinkAnchorAlert.setTestMode({ enabled });
}

export { SeaLinkAnchorAlert };
