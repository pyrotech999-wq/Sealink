"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ANCHOR_MAX_HORIZ_ACCURACY_M, type AnchorGpsQuality } from "@/lib/anchor-gps-stabilizer";
import { GPS_REFINE_TARGET_ACCURACY_M } from "@/lib/gps-refinement";
import { isLikelyAndroid, openAndroidLocationAppDetailsSettings } from "@/lib/location-env";
import { getDeviceName, setDeviceName } from "@/lib/device-id";
import { primeAnchorAlarmAudio } from "@/lib/anchor-alarm-sound";
import {
  ANCHOR_RADIUS_ADMIN_TEST_M,
  getAnchorRadiusOptionsForUi,
  type AnchorRadiusM,
  parseAnchorRadiusM,
} from "@/lib/anchor-alert-storage";
import {
  fetchNativeAnchorStatus,
  isCapacitorAndroidNative,
  readAnchorAndroidTestModeFromStorage,
  requestAndroidAnchorMonitoringPermissions,
  setNativeAnchorTestMode,
  startAndroidAnchorForegroundMonitoring,
  stopAndroidAnchorNativeMonitoringIfNeeded,
  writeAnchorAndroidTestModeToStorage,
} from "@/lib/capacitor-anchor-alert-android";

async function registerSessionDevice(
  currentDeviceId: string,
  explicitName?: string,
): Promise<{ ok: true } | { ok: false; error?: string; status?: number; code?: "NAME_REQUIRED" }> {
  if (!currentDeviceId || currentDeviceId === "server") return { ok: true };
  const deviceName = (explicitName ?? getDeviceName()).replace(/[\r\n]+/g, " ").trim().slice(0, 40);
  if (!deviceName) return { ok: false, code: "NAME_REQUIRED" };
  try {
    const r = await fetch("/api/demo/register-device", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ deviceId: currentDeviceId, deviceName }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: typeof j.error === "string" ? j.error : undefined, status: r.status };
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** When true: skip `/api/anchor/devices` and `/api/anchor/monitor` from this modal (see HomeLocationMap). */
  emergencyDisableLiveMapApis?: boolean;
  sharing: boolean;
  hasFix: boolean;
  pos: { lat: number; lng: number } | null;
  /** Last horizontal accuracy from the device (m), unclamped — used to gate arming. */
  horizontalAccuracyM?: number | null;
  /** While armed: stabilizer / accuracy state for copy. */
  anchorGpsQuality?: AnchorGpsQuality | null;
  /** Show iOS precise-location guidance (heuristic from user agent). */
  showIOSPreciseHint?: boolean;
  deviceId: string;
  config: {
    armed: boolean;
    lat: number | null;
    lng: number | null;
    radiusM: AnchorRadiusM;
    angleDeg: number;
    monitorDeviceId: string;
    lastBearingDeg?: number | null;
  };
  monitor: {
    monitorDeviceId: string | null;
    alertDeviceIds: string[];
  } | null;
  onUpdate: (next: {
    armed: boolean;
    lat: number | null;
    lng: number | null;
    radiusM: AnchorRadiusM;
    angleDeg: number;
    monitorDeviceId: string;
    lastBearingDeg?: number | null;
  }) => void;
  /** After a successful POST to `/api/anchor/monitor`, mirrors server monitor + alert IDs into map state (avoids waiting for the poll). */
  onMonitorRolesSaved?: (next: { monitorDeviceId: string | null; alertDeviceIds: string[] }) => void;
  /** Enables the 2 m admin-only test geofence in the radius list. */
  isAdmin?: boolean;
};

const ANGLE_OFF = 360;
const ANGLE_DEFAULT_ON = 45;

function buildAlertDeviceIds(
  alertMode: "this" | "other" | "both",
  alertOtherId: string,
  thisDeviceId: string,
): string[] {
  const ids: string[] = [];
  if (alertMode === "this" || alertMode === "both") ids.push(thisDeviceId);
  if ((alertMode === "other" || alertMode === "both") && alertOtherId) ids.push(alertOtherId);
  return ids;
}

function resolveMonitorDeviceIdForApi(monitorUiValue: string, thisDeviceId: string): string {
  return monitorUiValue === "this" ? thisDeviceId : monitorUiValue;
}

export function AnchorAlertModal({
  open,
  onClose,
  emergencyDisableLiveMapApis = false,
  sharing,
  hasFix,
  pos,
  horizontalAccuracyM = null,
  anchorGpsQuality = null,
  showIOSPreciseHint = false,
  deviceId,
  config,
  monitor,
  onUpdate,
  onMonitorRolesSaved,
  isAdmin = false,
}: Props) {
  const anchorRadiusUiOptions = useMemo(() => getAnchorRadiusOptionsForUi(isAdmin), [isAdmin]);
  const [radius, setRadius] = useState<string>(String(config.radiusM));
  const [angleDeg, setAngleDeg] = useState<string>(String(config.angleDeg ?? ANGLE_OFF));
  /** When false, angle-change alerts are disabled (stored as 360°). */
  const [angleEnabled, setAngleEnabled] = useState<boolean>((config.angleDeg ?? ANGLE_OFF) < ANGLE_OFF);
  const [deviceLabel, setDeviceLabel] = useState(() => (typeof window !== "undefined" ? getDeviceName() : ""));
  const [telegramChatId, setTelegramChatId] = useState("");
  const [devices, setDevices] = useState<{ deviceId: string; name: string; updatedAt: string; lastFixAt: string | null }[]>([]);
  const [devicesLoadError, setDevicesLoadError] = useState<string | null>(null);
  /** Explains missing “other device” in lists (registration / second phone). */
  const [devicesListHint, setDevicesListHint] = useState<string | null>(null);
  const [devicesRefreshing, setDevicesRefreshing] = useState(false);
  const [monitorDeviceId, setMonitorDeviceId] = useState<string>(config.monitorDeviceId || "this");
  const [alertMode, setAlertMode] = useState<"this" | "other" | "both">("both");
  const [alertOtherId, setAlertOtherId] = useState<string>("");
  const [androidSettingsDidntOpen, setAndroidSettingsDidntOpen] = useState(false);
  /** Android app only: in-app gate before system permission prompts for anchor background monitoring. */
  const [androidAnchorPermissionGate, setAndroidAnchorPermissionGate] = useState(false);
  const [androidAnchorPermissionBusy, setAndroidAnchorPermissionBusy] = useState(false);
  const [androidAnchorPermissionError, setAndroidAnchorPermissionError] = useState<string | null>(null);
  const [androidNativeTestMode, setAndroidNativeTestMode] = useState(() =>
    typeof window !== "undefined" ? readAnchorAndroidTestModeFromStorage() : false,
  );
  const [androidNativeDistanceM, setAndroidNativeDistanceM] = useState<number | null>(null);
  const openRef = useRef(open);
  const deviceLabelRef = useRef(deviceLabel);
  deviceLabelRef.current = deviceLabel;
  const configRef = useRef(config);
  configRef.current = config;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const androidSettingsTimerRef = useRef<number | null>(null);
  const androidNavCleanupRef = useRef<(() => void) | null>(null);
  const [rolesSaveBusy, setRolesSaveBusy] = useState(false);
  const [rolesSaveHint, setRolesSaveHint] = useState<string | null>(null);

  const acc = horizontalAccuracyM;
  const accuracyOkForArm =
    acc == null || !Number.isFinite(acc) ? hasFix && pos != null : acc <= GPS_REFINE_TARGET_ACCURACY_M;
  const effectiveDeviceName = useMemo(
    () => deviceLabel.replace(/[\r\n]+/g, " ").trim().slice(0, 40),
    [deviceLabel],
  );
  const deviceNameOk = effectiveDeviceName.length > 0;
  const canSet = sharing && hasFix && pos != null && accuracyOkForArm && deviceNameOk;
  const hasAnchor = config.lat != null && config.lng != null;
  const showAndroidPreciseHint = isLikelyAndroid();

  const hint = useMemo(() => {
    if (!sharing) return "Turn on “Share my location on this map” first.";
    if (!deviceNameOk) return "Enter a short name for this device below (e.g. Helm iPhone) so alerts and device lists show who is who.";
    if (!hasFix) return "Waiting for a GPS fix…";
    if (acc != null && Number.isFinite(acc) && acc > GPS_REFINE_TARGET_ACCURACY_M) {
      return `GPS accuracy is about ±${Math.round(acc)}m. Wait until it’s about ±${GPS_REFINE_TARGET_ACCURACY_M}m or better before arming (open sky, still water), or until the 30s lock phase ends and try again.`;
    }
    return null;
  }, [sharing, hasFix, acc, deviceNameOk]);

  const androidArmNeedsBackgroundFg = isCapacitorAndroidNative() && monitorDeviceId === "this";

  const reloadAnchorDevices = useCallback(async () => {
    if (emergencyDisableLiveMapApis) return;
    setDevicesLoadError(null);
    setDevicesListHint(null);
    setDevicesRefreshing(true);
    try {
      const nameForReg =
        deviceLabelRef.current.replace(/[\r\n]+/g, " ").trim().slice(0, 40) ||
        getDeviceName().replace(/[\r\n]+/g, " ").trim().slice(0, 40);
      if (!nameForReg) {
        setDevicesLoadError("Enter a name for this device in the field below, then tap Refresh devices again.");
        return;
      }
      const reg = await registerSessionDevice(deviceId, nameForReg);
      if (!reg.ok && reg.code === "NAME_REQUIRED") {
        setDevicesLoadError("Enter a name for this device in the field below, then tap Refresh devices again.");
        return;
      }
      const r = await fetch("/api/anchor/devices", { credentials: "same-origin", cache: "no-store" });
      const d = (await r.json()) as {
        devices?: { deviceId: string; name: string; updatedAt: string; lastFixAt: string | null }[];
        error?: string;
      };
      if (!r.ok) {
        setDevices([]);
        setDevicesLoadError(d.error === "Sign-in required" ? "Sign-in required — refresh the page and try again." : "Could not load devices.");
        return;
      }
      const list = Array.isArray(d.devices) ? d.devices : [];
      setDevices(list);
      const others = list.filter((x) => x.deviceId !== deviceId);
      if (others.length === 0) {
        if (!reg.ok && reg.error === "DEVICE_LIMIT") {
          setDevicesListHint(
            "This account already has two active devices registered elsewhere. We could not add this session — try again after using SeaLink on one of your other devices, or contact support if you need more than two.",
          );
        } else {
          setDevicesListHint(
            "No other device is registered for this account yet. On your other phone or tablet, open SeaLink while signed in to the same account (any page). Turn on “Share my location on this map” on the map for a short time so it can register, then tap Refresh devices at the top of this panel.",
          );
        }
      }
    } catch {
      setDevices([]);
      setDevicesLoadError("Network error loading devices.");
    } finally {
      setDevicesRefreshing(false);
    }
  }, [deviceId, emergencyDisableLiveMapApis]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => setDeviceLabel(getDeviceName()));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (emergencyDisableLiveMapApis) return;
    void reloadAnchorDevices();
    void fetch("/api/anchor/geofence", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const tid = d?.config?.telegramChatId;
        if (typeof tid === "string") setTelegramChatId(tid);
      })
      .catch(() => undefined);
  }, [open, reloadAnchorDevices]);

  useEffect(() => {
    if (!open) return;
    // Initialise alert target UI from server config when available.
    const ids = monitor?.alertDeviceIds ?? [];
    const hasThis = ids.includes(deviceId);
    const other = ids.find((x) => x !== deviceId) ?? "";
    queueMicrotask(() => {
      if (hasThis && other) {
        setAlertMode("both");
        setAlertOtherId(other);
      } else if (hasThis && !other) {
        setAlertMode("this");
        setAlertOtherId("");
      } else if (!hasThis && other) {
        setAlertMode("other");
        setAlertOtherId(other);
      } else {
        setAlertMode("both");
        setAlertOtherId("");
      }
    });
  }, [open, monitor?.alertDeviceIds, deviceId]);

  // Keep monitor dropdown aligned with server when you open the panel (two-device setups).
  useEffect(() => {
    if (!open || emergencyDisableLiveMapApis) return;
    const mid = monitor?.monitorDeviceId;
    if (mid == null) return;
    const ui = mid === deviceId ? "this" : mid;
    queueMicrotask(() => {
      setMonitorDeviceId(ui);
      const c = configRef.current;
      if (c.monitorDeviceId !== ui) onUpdateRef.current({ ...c, monitorDeviceId: ui });
    });
  }, [open, monitor?.monitorDeviceId, deviceId, emergencyDisableLiveMapApis]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (open) return;
    if (androidSettingsTimerRef.current != null) {
      window.clearTimeout(androidSettingsTimerRef.current);
      androidSettingsTimerRef.current = null;
    }
    androidNavCleanupRef.current?.();
    androidNavCleanupRef.current = null;
    queueMicrotask(() => {
      setAndroidSettingsDidntOpen(false);
      setAndroidAnchorPermissionGate(false);
      setAndroidAnchorPermissionBusy(false);
      setAndroidAnchorPermissionError(null);
      setAndroidNativeDistanceM(null);
      setRolesSaveHint(null);
      setDevicesListHint(null);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const deg = config.angleDeg ?? ANGLE_OFF;
    const on = deg < ANGLE_OFF;
    queueMicrotask(() => {
      setAngleEnabled(on);
      setAngleDeg(String(on ? deg : ANGLE_DEFAULT_ON));
    });
  }, [open, config.angleDeg]);

  // Local config seed only when the account has no monitor row yet; otherwise server wins (see effect above).
  useEffect(() => {
    if (!open) return;
    if (monitor?.monitorDeviceId != null) return;
    queueMicrotask(() => setMonitorDeviceId(config.monitorDeviceId || "this"));
  }, [open, config.monitorDeviceId, monitor?.monitorDeviceId]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => setRadius(String(config.radiusM)));
  }, [open, config.radiusM]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => setAndroidNativeTestMode(readAnchorAndroidTestModeFromStorage()));
  }, [open]);

  useEffect(() => {
    if (!open || !isCapacitorAndroidNative() || monitorDeviceId !== "this") return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const s = await fetchNativeAnchorStatus();
          if (typeof s.lastDistanceMeters === "number" && Number.isFinite(s.lastDistanceMeters)) {
            setAndroidNativeDistanceM(s.lastDistanceMeters);
          }
        } catch {
          /* ignore */
        }
      })();
    }, 2000);
    return () => window.clearInterval(id);
  }, [open, monitorDeviceId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:px-4 sm:py-6">
      <div className="flex max-h-[min(92dvh,820px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-5">
          <h3
            id="anchor-alert-dialog-title"
            className="min-w-0 flex-1 text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50"
          >
            Anchor alert &amp; geofence
          </h3>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={devicesRefreshing || emergencyDisableLiveMapApis}
              title={
                emergencyDisableLiveMapApis
                  ? "Device list refresh is unavailable in this mode."
                  : "Reload the list of signed-in devices from the server."
              }
              onClick={() => void reloadAnchorDevices()}
              className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {devicesRefreshing ? "Refreshing…" : "Refresh devices"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5"
          role="region"
          aria-labelledby="anchor-alert-dialog-title"
        >
          <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">
            Drop an anchor at your current GPS position and choose a circular geofence. While armed, the map shows an orange
            ring; you get an alert if the monitored device moves outside that circle (plus a small GPS buffer) while this app
            stays open.
          </p>

        {hint ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            {hint}
          </p>
        ) : null}

        {isCapacitorAndroidNative() && monitorDeviceId === "this" ? (
          <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 text-xs leading-5 text-purple-950 dark:border-purple-900/50 dark:bg-purple-950/35 dark:text-purple-50">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-purple-400 text-purple-700"
                checked={androidNativeTestMode}
                onChange={(e) => {
                  const on = e.target.checked;
                  setAndroidNativeTestMode(on);
                  writeAnchorAndroidTestModeToStorage(on);
                  void setNativeAnchorTestMode(on);
                }}
              />
              <span>
                <span className="font-semibold text-purple-900 dark:text-purple-100">Native test mode (Android)</span>
                <span className="mt-1 block text-[11px] font-normal text-purple-900/85 dark:text-purple-100/85">
                  Uses a <strong className="font-semibold">5 m</strong> radius on the device for drift checks and shows the
                  latest native-computed distance to your anchor (logcat tags{" "}
                  <span className="font-mono text-[10px]">ANCHOR_DISTANCE_METERS</span>, etc.).
                </span>
              </span>
            </label>
            {androidNativeTestMode && androidNativeDistanceM != null && Number.isFinite(androidNativeDistanceM) ? (
              <p className="mt-2 rounded-md bg-white/80 px-2 py-1.5 font-mono text-[11px] text-purple-950 dark:bg-purple-900/40 dark:text-purple-100">
                Latest native distance: {androidNativeDistanceM.toFixed(1)} m
              </p>
            ) : null}
          </div>
        ) : null}

        {showIOSPreciseHint ? (
          <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100">
            <span className="font-semibold text-sky-900 dark:text-sky-50">iPhone / iPad:</span> Settings → SeaLink →
            Location → turn on <strong className="font-semibold">Precise Location</strong>. Approximate-only mode makes
            small anchor rings unreliable. iOS does not let websites flip this for you — it has to be changed in Settings.
          </p>
        ) : null}

        {showAndroidPreciseHint && !showIOSPreciseHint ? (
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100">
            <p>
              <span className="font-semibold text-sky-900 dark:text-sky-50">Android:</span> In system settings, allow{" "}
              <strong className="font-semibold">precise</strong> (high-accuracy) location for SeaLink or your browser. Small
              anchor rings need a tight GPS fix; if location is blurred for privacy, alerts can misfire.
            </p>
            <p className="mt-2 text-[11px] leading-snug opacity-90">
              Android does not let websites turn precise location on automatically — only you can, in Settings. Use{" "}
              <strong className="font-semibold">Settings → Apps → your browser or SeaLink → Permissions → Location</strong>
              .
            </p>
            <button
              type="button"
              onClick={() => {
                setAndroidSettingsDidntOpen(false);
                if (androidSettingsTimerRef.current != null) {
                  window.clearTimeout(androidSettingsTimerRef.current);
                  androidSettingsTimerRef.current = null;
                }
                androidNavCleanupRef.current?.();
                androidNavCleanupRef.current = null;

                let navigatedAway = false;
                const markAway = () => {
                  if (document.visibilityState === "hidden") navigatedAway = true;
                };
                const onPageHide = () => {
                  navigatedAway = true;
                };
                document.addEventListener("visibilitychange", markAway);
                window.addEventListener("pagehide", onPageHide);
                const cleanupListeners = () => {
                  document.removeEventListener("visibilitychange", markAway);
                  window.removeEventListener("pagehide", onPageHide);
                };
                androidNavCleanupRef.current = cleanupListeners;

                openAndroidLocationAppDetailsSettings();

                androidSettingsTimerRef.current = window.setTimeout(() => {
                  androidSettingsTimerRef.current = null;
                  cleanupListeners();
                  androidNavCleanupRef.current = null;
                  if (!navigatedAway && openRef.current) setAndroidSettingsDidntOpen(true);
                }, 2000);
              }}
              className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-lg border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-950 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/50 dark:text-sky-50 dark:hover:bg-sky-800/80 sm:w-auto"
            >
              Open in Android settings
            </button>
            {androidSettingsDidntOpen ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/35">
                <p className="text-[11px] leading-snug text-amber-950 dark:text-amber-100">
                  Settings may not have opened. Use the path above, or open the full guide in Help (same steps as on this
                  page).
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link
                    href="/help#anchor-android-location"
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-800 px-3 text-xs font-semibold text-white hover:bg-amber-900 dark:bg-amber-700 dark:hover:bg-amber-600"
                  >
                    Android location in Help
                  </Link>
                  <button
                    type="button"
                    onClick={() => setAndroidSettingsDidntOpen(false)}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/60 dark:text-amber-50 dark:hover:bg-amber-800/80"
                  >
                    Close message
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {config.armed && anchorGpsQuality && anchorGpsQuality !== "ok" ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            {anchorGpsQuality === "poor_accuracy"
              ? `Monitoring uses fixes with horizontal accuracy about ±${ANCHOR_MAX_HORIZ_ACCURACY_M}m or better. Current readings are worse — alerts may be delayed until GPS improves.`
              : "Hold steady: we’re averaging a few high-quality fixes so anchor drift isn’t triggered by GPS noise."}
          </p>
        ) : null}

        {devicesLoadError ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
            {devicesLoadError}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            This device name <span className="text-red-600 dark:text-red-400">(required)</span>
            <input
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              onBlur={() => {
                const t = deviceLabel.replace(/[\r\n]+/g, " ").trim().slice(0, 40);
                if (t !== deviceLabel) setDeviceLabel(t);
                setDeviceName(t);
                if (!t || emergencyDisableLiveMapApis || !deviceId || deviceId === "server") return;
                void registerSessionDevice(deviceId, t);
                void fetch("/api/anchor/devices", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "Content-Type": "application/json", Accept: "application/json" },
                  body: JSON.stringify({ deviceId, name: t }),
                }).catch(() => undefined);
              }}
              placeholder="e.g. Helm iPhone"
              required
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <span className="mt-1 block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
              Shown in device lists and anchor warnings. Use a unique name on each phone or tablet.
            </span>
          </label>

          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Telegram chat ID <span className="text-zinc-400 dark:text-zinc-500">(optional)</span>
            <input
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              onBlur={() => {
                const tid = telegramChatId.trim().slice(0, 40);
                if (tid !== telegramChatId) setTelegramChatId(tid);
                if (emergencyDisableLiveMapApis) return;
                void fetch("/api/anchor/geofence", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ telegramChatId: tid || null }),
                }).catch(() => undefined);
              }}
              placeholder="e.g. 123456789"
              autoComplete="off"
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <span className="mt-1 block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
              Receive anchor alerts via Telegram. Get your Telegram Chat ID from{" "}
              <a href="https://telegram.me/userinfobot" target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
                @userinfobot
              </a>.
            </span>
          </label>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-3 text-xs text-emerald-950 dark:border-emerald-900/45 dark:bg-emerald-950/25 dark:text-emerald-50">
            <p className="font-semibold text-emerald-950 dark:text-emerald-100">Two signed-in devices</p>
            <p className="mt-1 text-[11px] leading-snug opacity-90">
              Pick <strong className="font-semibold">one</strong> device whose GPS is checked against the anchor, and
              separately pick <strong className="font-semibold">which device(s)</strong> should get the full-screen alarm.
              They can be the same device, or one can monitor while the other only receives alerts.
            </p>

            {devicesListHint ? (
              <p className="mt-2 rounded-md border border-amber-200/90 bg-amber-50/95 px-2.5 py-2 text-[11px] leading-snug text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-50">
                {devicesListHint}
              </p>
            ) : null}

            <label className="mt-3 block text-xs font-medium text-emerald-950 dark:text-emerald-100">
              1 — Device that <span className="font-semibold">monitors</span> (runs the geofence on its GPS)
              <select
                value={monitorDeviceId}
                onChange={(e) => {
                  const v = e.target.value;
                  const trimmedName = deviceLabel.replace(/[\r\n]+/g, " ").trim().slice(0, 40);
                  if (!trimmedName) {
                    setRolesSaveHint("Enter this device’s name in the required field above before changing who monitors.");
                    return;
                  }
                  const nextResolved = resolveMonitorDeviceIdForApi(v, deviceId);
                  const curResolved = monitor?.monitorDeviceId ?? null;
                  if (curResolved != null && curResolved !== nextResolved) {
                    const ok = window.confirm(
                      "Changing the monitoring device updates your account. The previous monitor will stop evaluating this anchor until you switch back. Continue?",
                    );
                    if (!ok) return;
                  }
                  setMonitorDeviceId(v);
                  onUpdate({ ...config, monitorDeviceId: v });
                  if (!emergencyDisableLiveMapApis) {
                    void fetch("/api/anchor/monitor", {
                      method: "POST",
                      credentials: "same-origin",
                      headers: { "Content-Type": "application/json", Accept: "application/json" },
                      body: JSON.stringify({ monitorDeviceId: nextResolved }),
                    }).catch(() => undefined);
                  }
                  setRolesSaveHint("Monitor device saved. Use step 2 + Save below for who gets the alarm.");
                }}
                className="mt-1 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-50"
              >
                <option value="this">This device (this browser / app)</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {(d.name || "This device").trim() || "This device"}
                    {d.lastFixAt ? ` · last fix ${new Date(d.lastFixAt).toLocaleString("en-GB")}` : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-emerald-900/85 dark:text-emerald-100/85">
                That device should stay on SeaLink with location sharing so fixes keep updating. The other device can stay
                signed in only to receive alerts if you prefer.
              </span>
            </label>

            <div className="mt-3 border-t border-emerald-200/80 pt-3 dark:border-emerald-800/60">
              <p className="text-xs font-medium text-emerald-950 dark:text-emerald-100">
                2 — Who should get the <span className="font-semibold">alarm pop-up</span>?
              </p>
              <div className="mt-2 grid gap-2">
                <label className="block text-xs font-medium text-emerald-950 dark:text-emerald-100">
                  Alert on
                  <select
                    value={alertMode}
                    onChange={(e) => setAlertMode(e.target.value as "this" | "other" | "both")}
                    className="mt-1 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-50"
                  >
                    <option value="this">This device only</option>
                    <option value="other">The other device only</option>
                    <option value="both">Both devices</option>
                  </select>
                </label>
                {alertMode !== "this" ? (
                  <label className="block text-xs font-medium text-emerald-950 dark:text-emerald-100">
                    Other device (choose one)
                    <select
                      value={alertOtherId}
                      onChange={(e) => setAlertOtherId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-50"
                    >
                      <option value="">Select…</option>
                      {devices
                        .filter((d) => d.deviceId !== deviceId)
                        .map((d) => (
                          <option key={`alert-${d.deviceId}`} value={d.deviceId}>
                            {(d.name || "This device").trim() || "This device"}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  disabled={rolesSaveBusy}
                  onClick={() => {
                    void (async () => {
                      setRolesSaveHint(null);
                      if (!deviceLabel.replace(/[\r\n]+/g, " ").trim().slice(0, 40)) {
                        setRolesSaveHint("Enter a name for this device in the required field above before saving.");
                        return;
                      }
                      if ((alertMode === "other" || alertMode === "both") && !alertOtherId) {
                        setRolesSaveHint("Choose the other device in the list above, or switch “Alert on” to this device only.");
                        return;
                      }
                      const alertIds = buildAlertDeviceIds(alertMode, alertOtherId, deviceId);
                      if (alertIds.length === 0) {
                        setRolesSaveHint("No alert devices selected.");
                        return;
                      }
                      const monitorResolved = resolveMonitorDeviceIdForApi(monitorDeviceId, deviceId);
                      setRolesSaveBusy(true);
                      try {
                        if (!emergencyDisableLiveMapApis) {
                          const r = await fetch("/api/anchor/monitor", {
                            method: "POST",
                            credentials: "same-origin",
                            headers: { "Content-Type": "application/json", Accept: "application/json" },
                            body: JSON.stringify({
                              monitorDeviceId: monitorResolved,
                              alertDeviceIds: alertIds,
                            }),
                          });
                          if (!r.ok) {
                            const err = (await r.json().catch(() => ({}))) as { error?: string };
                            setRolesSaveHint(err.error ?? "Could not save. Try again.");
                            return;
                          }
                          onMonitorRolesSaved?.({
                            monitorDeviceId: monitorResolved,
                            alertDeviceIds: alertIds,
                          });
                        }
                        onUpdateRef.current({
                          ...configRef.current,
                          monitorDeviceId,
                        });
                        setRolesSaveHint("Saved — monitor and alert devices are updated on your account.");
                      } catch {
                        setRolesSaveHint("Network error saving.");
                      } finally {
                        setRolesSaveBusy(false);
                      }
                    })();
                  }}
                  className="h-9 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  {rolesSaveBusy ? "Saving…" : "Save monitor & alert devices"}
                </button>
                {rolesSaveHint ? (
                  <p className="text-[11px] leading-snug text-emerald-900 dark:text-emerald-100/90">{rolesSaveHint}</p>
                ) : null}
                <p className="text-[10px] opacity-80">
                  Each device must open SeaLink while signed in (any tab) so it appears in the lists. After the other device
                  has loaded the app, tap <strong className="font-semibold">Refresh devices</strong> at the top of this panel.
                </p>
              </div>
            </div>
          </div>

          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Geofence radius
            <select
              value={radius}
              onChange={(e) => {
                const v = e.target.value;
                setRadius(v);
                onUpdate({ ...config, radiusM: parseAnchorRadiusM(Number(v), { isAdmin }), monitorDeviceId });
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {anchorRadiusUiOptions.map((m) => (
                <option key={m} value={String(m)}>
                  {m === ANCHOR_RADIUS_ADMIN_TEST_M ? "2m (admin test only)" : `${m}m`}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-zinc-500">
              Monitored position must stay inside this circle around the anchor (geofence), or an alert fires.
            </span>
            {isAdmin ? (
              <span className="mt-1 block text-[11px] text-amber-800 dark:text-amber-200/90">
                Admin 2 m ring is for testing the alarm only — normal GPS noise is often larger than 2 m, so expect false
                triggers unless conditions are ideal or you use Android native test mode.
              </span>
            ) : null}
          </label>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
            <label className="flex cursor-pointer items-start gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400 text-green-600"
                checked={angleEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setAngleEnabled(on);
                  if (!on) {
                    setAngleDeg(String(ANGLE_DEFAULT_ON));
                    onUpdate({ ...config, angleDeg: ANGLE_OFF, monitorDeviceId });
                  } else {
                    const v = Math.max(0, Math.min(359, Math.round(Number(angleDeg) || ANGLE_DEFAULT_ON)));
                    const use = Number.isFinite(v) && v < ANGLE_OFF ? v : ANGLE_DEFAULT_ON;
                    setAngleDeg(String(use));
                    onUpdate({ ...config, angleDeg: use, monitorDeviceId });
                  }
                }}
              />
              <span>
                Alert on bearing change
                <span className="mt-0.5 block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                  Off by default. Turn on to warn if direction from the anchor shifts more than the limit below.
                </span>
              </span>
            </label>
            {angleEnabled ? (
              <label className="mt-3 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Max bearing change (degrees)
                <select
                  value={angleDeg}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAngleDeg(v);
                    onUpdate({ ...config, angleDeg: Number(v), monitorDeviceId });
                  }}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="0">0°</option>
                  <option value="10">10°</option>
                  <option value="20">20°</option>
                  <option value="30">30°</option>
                  <option value="45">45°</option>
                  <option value="60">60°</option>
                  <option value="90">90°</option>
                  <option value="120">120°</option>
                  <option value="180">180°</option>
                  <option value="270">270°</option>
                </select>
              </label>
            ) : null}
          </div>

          {androidArmNeedsBackgroundFg && androidAnchorPermissionGate ? (
            <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3 text-xs leading-5 text-indigo-950 dark:border-indigo-900/50 dark:bg-indigo-950/35 dark:text-indigo-50">
              <p className="font-semibold text-indigo-950 dark:text-indigo-100">Background anchor monitoring (Android app)</p>
              <p className="mt-2 text-[11px] opacity-95">
                When you arm while <strong className="font-semibold">this device</strong> is the monitor, SeaLink can start a{" "}
                <strong className="font-semibold">foreground location service</strong> so drift checks continue if you leave
                the app or turn the screen off. You will see a persistent notification:{" "}
                <span className="font-medium">“SeaLink Anchor Alert is monitoring your anchor position.”</span>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] opacity-95">
                <li>Location is evaluated on-device for the geofence; coordinates are not sent for ads or analytics.</li>
                <li>
                  Android will then ask for <strong className="font-semibold">notification</strong> access (to show that
                  notice) and <strong className="font-semibold">all-the-time / background location</strong> — only for Anchor
                  Alert, not for normal map sharing.
                </li>
                <li>You can revoke permissions or disarm any time; disarm or sign out stops the service.</li>
              </ul>
              {androidAnchorPermissionError ? (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                  {androidAnchorPermissionError}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={androidAnchorPermissionBusy}
                  onClick={() => setAndroidAnchorPermissionGate(false)}
                  className="h-9 rounded-lg border border-indigo-300 bg-white px-3 text-sm font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-50 dark:hover:bg-indigo-900/80"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={androidAnchorPermissionBusy || !canSet}
                  onClick={() => {
                    void (async () => {
                      void primeAnchorAlarmAudio();
                      setAndroidAnchorPermissionBusy(true);
                      setAndroidAnchorPermissionError(null);
                      try {
                        const perm = await requestAndroidAnchorMonitoringPermissions();
                        if (!perm.ok) {
                          setAndroidAnchorPermissionError(
                            perm.reason === "notifications"
                              ? "Notification permission was denied. Allow notifications for SeaLink so the monitoring service can show its persistent status."
                              : "Background (“all the time”) location was denied. Anchor drift checks in the background cannot run without it — you can try again or change this in Android settings.",
                          );
                          return;
                        }
                        const n = parseAnchorRadiusM(Number(radius), { isAdmin });
                        const a = angleEnabled
                          ? Math.max(0, Math.min(359, Math.round(Number(angleDeg) || ANGLE_DEFAULT_ON)))
                          : ANGLE_OFF;
                        const monResolved = resolveMonitorDeviceIdForApi(monitorDeviceId, deviceId);
                        const ids = buildAlertDeviceIds(alertMode, alertOtherId, deviceId);
                        if (!emergencyDisableLiveMapApis) {
                          void fetch("/api/anchor/monitor", {
                            method: "POST",
                            credentials: "same-origin",
                            headers: { "Content-Type": "application/json", Accept: "application/json" },
                            body: JSON.stringify({ monitorDeviceId: monResolved, alertDeviceIds: ids }),
                          });
                        }
                        onUpdate({
                          ...config,
                          lat: pos!.lat,
                          lng: pos!.lng,
                          radiusM: n,
                          angleDeg: a,
                          armed: true,
                          monitorDeviceId,
                        });
                        await startAndroidAnchorForegroundMonitoring({
                          monitorDeviceId,
                          deviceId,
                          lat: pos!.lat,
                          lng: pos!.lng,
                          radiusM: n,
                          angleDeg: a,
                          lastBearingDeg: config.lastBearingDeg,
                          testMode: readAnchorAndroidTestModeFromStorage(),
                        });
                        setAndroidAnchorPermissionGate(false);
                        onClose();
                      } catch (e) {
                        setAndroidAnchorPermissionError(
                          e instanceof Error ? e.message : "Could not start Android anchor monitoring.",
                        );
                      } finally {
                        setAndroidAnchorPermissionBusy(false);
                      }
                    })();
                  }}
                  className="h-9 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {androidAnchorPermissionBusy ? "Working…" : "Continue to system permissions"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSet || (androidArmNeedsBackgroundFg && androidAnchorPermissionGate)}
              onClick={() => {
                if (androidArmNeedsBackgroundFg && !androidAnchorPermissionGate) {
                  setAndroidAnchorPermissionError(null);
                  setAndroidAnchorPermissionGate(true);
                  return;
                }
                // Prime the 999 alarm sound while we have a user gesture (helps avoid “Tap to play alarm sound” later).
                void primeAnchorAlarmAudio();
                const n = parseAnchorRadiusM(Number(radius), { isAdmin });
                const a = angleEnabled
                  ? Math.max(0, Math.min(359, Math.round(Number(angleDeg) || ANGLE_DEFAULT_ON)))
                  : ANGLE_OFF;
                // Persist monitor + alert targets to server so it applies across both devices.
                const monResolved = resolveMonitorDeviceIdForApi(monitorDeviceId, deviceId);
                const ids = buildAlertDeviceIds(alertMode, alertOtherId, deviceId);
                if (!emergencyDisableLiveMapApis) {
                  void fetch("/api/anchor/monitor", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({ monitorDeviceId: monResolved, alertDeviceIds: ids }),
                  });
                }
                onUpdate({
                  ...config,
                  lat: pos!.lat,
                  lng: pos!.lng,
                  radiusM: n,
                  angleDeg: a,
                  armed: true,
                  monitorDeviceId,
                });
                void startAndroidAnchorForegroundMonitoring({
                  monitorDeviceId,
                  deviceId,
                  lat: pos!.lat,
                  lng: pos!.lng,
                  radiusM: n,
                  angleDeg: a,
                  lastBearingDeg: config.lastBearingDeg,
                  testMode: readAnchorAndroidTestModeFromStorage(),
                });
                onClose();
              }}
              className="h-9 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {androidArmNeedsBackgroundFg && !androidAnchorPermissionGate
                ? "Review background monitoring…"
                : "Arm geofence at current position"}
            </button>
            <button
              type="button"
              disabled={!config.armed}
              onClick={() => {
                void stopAndroidAnchorNativeMonitoringIfNeeded();
                onUpdate({ ...config, armed: false, remoteAlarmSilencedUntilReset: false });
                onClose();
              }}
              className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Disarm
            </button>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">Status</p>
            <p className="mt-1">
              {config.armed && hasAnchor ? "Armed" : "Not armed"} · Distance {config.radiusM}m · Bearing change{" "}
              {(config.angleDeg ?? ANGLE_OFF) >= ANGLE_OFF ? "off" : `≤${config.angleDeg}°`}
              {acc != null && Number.isFinite(acc) ? ` · GPS ±${Math.round(acc)}m` : null}
            </p>
            {hasAnchor ? (
              <p className="mt-1 text-[11px] opacity-80">
                Anchor {config.lat!.toFixed(5)}, {config.lng!.toFixed(5)}
              </p>
            ) : (
              <p className="mt-1 text-[11px] opacity-80">No anchor set yet.</p>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

