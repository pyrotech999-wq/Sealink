"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ANCHOR_MAX_HORIZ_ACCURACY_M, type AnchorGpsQuality } from "@/lib/anchor-gps-stabilizer";
import { GPS_REFINE_TARGET_ACCURACY_M } from "@/lib/gps-refinement";
import { isLikelyAndroid, openAndroidLocationAppDetailsSettings } from "@/lib/location-env";
import { getDeviceName, setDeviceName } from "@/lib/device-id";
import { primeAnchorAlarmAudio } from "@/lib/anchor-alarm-sound";
import {
  ANCHOR_RADIUS_METRES_OPTIONS,
  type AnchorRadiusM,
  parseAnchorRadiusM,
} from "@/lib/anchor-alert-storage";
import {
  isCapacitorAndroidNative,
  requestAndroidAnchorMonitoringPermissions,
  startAndroidAnchorForegroundMonitoring,
  stopAndroidAnchorNativeMonitoringIfNeeded,
} from "@/lib/capacitor-anchor-alert-android";

async function registerSessionDevice(currentDeviceId: string): Promise<void> {
  if (!currentDeviceId || currentDeviceId === "server") return;
  try {
    await fetch("/api/demo/register-device", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ deviceId: currentDeviceId, deviceName: getDeviceName() }),
    });
  } catch {
    /* ignore */
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
  }) => void;
};

const ANGLE_OFF = 360;
const ANGLE_DEFAULT_ON = 45;

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
}: Props) {
  const [radius, setRadius] = useState<string>(String(config.radiusM));
  const [angleDeg, setAngleDeg] = useState<string>(String(config.angleDeg ?? ANGLE_OFF));
  /** When false, angle-change alerts are disabled (stored as 360°). */
  const [angleEnabled, setAngleEnabled] = useState<boolean>((config.angleDeg ?? ANGLE_OFF) < ANGLE_OFF);
  const [deviceLabel, setDeviceLabel] = useState(() => (typeof window !== "undefined" ? getDeviceName() : ""));
  const [devices, setDevices] = useState<{ deviceId: string; name: string; updatedAt: string; lastFixAt: string | null }[]>([]);
  const [devicesLoadError, setDevicesLoadError] = useState<string | null>(null);
  const [monitorDeviceId, setMonitorDeviceId] = useState<string>(config.monitorDeviceId || "this");
  const [alertMode, setAlertMode] = useState<"this" | "other" | "both">("both");
  const [alertOtherId, setAlertOtherId] = useState<string>("");
  const [androidSettingsDidntOpen, setAndroidSettingsDidntOpen] = useState(false);
  /** Android app only: in-app gate before system permission prompts for anchor background monitoring. */
  const [androidAnchorPermissionGate, setAndroidAnchorPermissionGate] = useState(false);
  const [androidAnchorPermissionBusy, setAndroidAnchorPermissionBusy] = useState(false);
  const [androidAnchorPermissionError, setAndroidAnchorPermissionError] = useState<string | null>(null);
  const openRef = useRef(open);
  const androidSettingsTimerRef = useRef<number | null>(null);
  const androidNavCleanupRef = useRef<(() => void) | null>(null);

  const acc = horizontalAccuracyM;
  const accuracyOkForArm =
    acc == null || !Number.isFinite(acc) ? hasFix && pos != null : acc <= GPS_REFINE_TARGET_ACCURACY_M;
  const canSet = sharing && hasFix && pos != null && accuracyOkForArm;
  const hasAnchor = config.lat != null && config.lng != null;
  const showAndroidPreciseHint = isLikelyAndroid();

  const hint = useMemo(() => {
    if (!sharing) return "Turn on “Share my location on this map” first.";
    if (!hasFix) return "Waiting for a GPS fix…";
    if (acc != null && Number.isFinite(acc) && acc > GPS_REFINE_TARGET_ACCURACY_M) {
      return `GPS accuracy is about ±${Math.round(acc)}m. Wait until it’s about ±${GPS_REFINE_TARGET_ACCURACY_M}m or better before arming (open sky, still water), or until the 30s lock phase ends and try again.`;
    }
    return null;
  }, [sharing, hasFix, acc]);

  const androidArmNeedsBackgroundFg = isCapacitorAndroidNative() && monitorDeviceId === "this";

  useEffect(() => {
    if (!open) return;
    if (emergencyDisableLiveMapApis) return;
    void (async () => {
      setDevicesLoadError(null);
      try {
        await registerSessionDevice(deviceId);
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
        setDevices(Array.isArray(d.devices) ? d.devices : []);
      } catch {
        setDevices([]);
        setDevicesLoadError("Network error loading devices.");
      }
    })();
  }, [open, deviceId, emergencyDisableLiveMapApis]);

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

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => setMonitorDeviceId(config.monitorDeviceId || "this"));
  }, [open, config.monitorDeviceId]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => setRadius(String(config.radiusM)));
  }, [open, config.radiusM]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:px-4 sm:py-6">
      <div className="flex max-h-[min(92dvh,820px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800 sm:px-5">
          <h3 id="anchor-alert-dialog-title" className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
            Anchor alert &amp; geofence
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Close
          </button>
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
            This device label (to recognise it later)
            <input
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              onBlur={() => setDeviceName(deviceLabel)}
              placeholder="e.g. iPad on boat"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>

          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Device to monitor
            <select
              value={monitorDeviceId}
              onChange={(e) => {
                const v = e.target.value;
                const cur = monitor?.monitorDeviceId;
                // Switching monitor halts monitoring on the other device — confirm.
                if (cur && cur !== "this" && v !== cur) {
                  const ok = window.confirm(
                    "Monitoring is currently active on another device. Switching will halt monitoring on the other device. Continue?",
                  );
                  if (!ok) return;
                }
                setMonitorDeviceId(v);
                onUpdate({ ...config, monitorDeviceId: v });
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="this">This device (current browser)</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.name || d.deviceId.slice(0, 8)}{" "}
                  {d.lastFixAt ? `· last fix ${new Date(d.lastFixAt).toLocaleString("en-GB")}` : ""}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-zinc-500">
              Leave a device on the boat with the app open to keep sending location. Select it here to monitor.
            </span>
          </label>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">Alert delivery</p>
            <p className="mt-1 text-[11px] opacity-80">
              Choose which signed-in device(s) should show the alert pop-up. Only one device monitors movement.
            </p>
            <div className="mt-2 grid gap-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Send alerts to
                <select
                  value={alertMode}
                  onChange={(e) => setAlertMode(e.target.value as "this" | "other" | "both")}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="this">This device</option>
                  <option value="other">Other device</option>
                  <option value="both">Both devices</option>
                </select>
              </label>
              {alertMode !== "this" ? (
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Other device
                  <select
                    value={alertOtherId}
                    onChange={(e) => setAlertOtherId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                  >
                    <option value="">Select…</option>
                    {devices
                      .filter((d) => d.deviceId !== deviceId)
                      .map((d) => (
                        <option key={`alert-${d.deviceId}`} value={d.deviceId}>
                          {d.name || d.deviceId.slice(0, 8)}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  const ids: string[] = [];
                  if (alertMode === "this" || alertMode === "both") ids.push(deviceId);
                  if ((alertMode === "other" || alertMode === "both") && alertOtherId) ids.push(alertOtherId);
                  if (!emergencyDisableLiveMapApis) {
                    void fetch("/api/anchor/monitor", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ alertDeviceIds: ids }),
                    });
                  }
                }}
                className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Save alert delivery
              </button>
              <p className="text-[10px] opacity-75">
                Note: Both devices must load SeaLink while signed in (any tab) so they appear here. Close and reopen this
                panel to refresh the list.
              </p>
            </div>
          </div>

          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Geofence radius
            <select
              value={radius}
              onChange={(e) => {
                const v = e.target.value;
                setRadius(v);
                onUpdate({ ...config, radiusM: parseAnchorRadiusM(Number(v)), monitorDeviceId });
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {ANCHOR_RADIUS_METRES_OPTIONS.map((m) => (
                <option key={m} value={String(m)}>
                  {m}m
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-zinc-500">
              Monitored position must stay inside this circle around the anchor (geofence), or an alert fires.
            </span>
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
                  onClick={() => void setAndroidAnchorPermissionGate(false)}
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
                        const n = parseAnchorRadiusM(Number(radius));
                        const a = angleEnabled
                          ? Math.max(0, Math.min(359, Math.round(Number(angleDeg) || ANGLE_DEFAULT_ON)))
                          : ANGLE_OFF;
                        const chosenMonitor = monitorDeviceId === "this" ? deviceId : monitorDeviceId;
                        const ids: string[] = [];
                        if (alertMode === "this" || alertMode === "both") ids.push(deviceId);
                        if ((alertMode === "other" || alertMode === "both") && alertOtherId) ids.push(alertOtherId);
                        if (!emergencyDisableLiveMapApis) {
                          void fetch("/api/anchor/monitor", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ monitorDeviceId: chosenMonitor, alertDeviceIds: ids }),
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
                const n = parseAnchorRadiusM(Number(radius));
                const a = angleEnabled
                  ? Math.max(0, Math.min(359, Math.round(Number(angleDeg) || ANGLE_DEFAULT_ON)))
                  : ANGLE_OFF;
                // Persist monitor + alert targets to server so it applies across both devices.
                const chosenMonitor = monitorDeviceId === "this" ? deviceId : monitorDeviceId;
                const ids: string[] = [];
                if (alertMode === "this" || alertMode === "both") ids.push(deviceId);
                if ((alertMode === "other" || alertMode === "both") && alertOtherId) ids.push(alertOtherId);
                if (!emergencyDisableLiveMapApis) {
                  void fetch("/api/anchor/monitor", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ monitorDeviceId: chosenMonitor, alertDeviceIds: ids }),
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
                onUpdate({ ...config, armed: false });
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

