"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  emergencyDisableLiveMapApis?: boolean;
  sharing: boolean;
  hasFix: boolean;
  pos: { lat: number; lng: number } | null;
  horizontalAccuracyM?: number | null;
  anchorGpsQuality?: AnchorGpsQuality | null;
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
  onMonitorRolesSaved?: (next: { monitorDeviceId: string | null; alertDeviceIds: string[] }) => void;
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

export function MobileAnchorAlertModal({
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const anchorRadiusUiOptions = useMemo(() => getAnchorRadiusOptionsForUi(isAdmin), [isAdmin]);
  const [radius, setRadius] = useState<string>(String(config.radiusM));
  const [angleDeg, setAngleDeg] = useState<string>(String(config.angleDeg ?? ANGLE_OFF));
  const [angleEnabled, setAngleEnabled] = useState<boolean>((config.angleDeg ?? ANGLE_OFF) < ANGLE_OFF);
  const [deviceLabel, setDeviceLabel] = useState(() => (typeof window !== "undefined" ? getDeviceName() : ""));
  const [telegramChatId, setTelegramChatId] = useState("");
  const [devices, setDevices] = useState<{ deviceId: string; name: string; updatedAt: string; lastFixAt: string | null }[]>([]);
  const [devicesLoadError, setDevicesLoadError] = useState<string | null>(null);
  const [devicesListHint, setDevicesListHint] = useState<string | null>(null);
  const [devicesRefreshing, setDevicesRefreshing] = useState(false);
  const [monitorDeviceId, setMonitorDeviceId] = useState<string>(config.monitorDeviceId || "this");
  const [alertMode, setAlertMode] = useState<"this" | "other" | "both">("both");
  const [alertOtherId, setAlertOtherId] = useState<string>("");
  const [androidSettingsDidntOpen, setAndroidSettingsDidntOpen] = useState(false);
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
    setDeviceLabel(getDeviceName());
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
  }, [open, reloadAnchorDevices, emergencyDisableLiveMapApis]);

  useEffect(() => {
    if (!open) return;
    const ids = monitor?.alertDeviceIds ?? [];
    const hasThis = ids.includes(deviceId);
    const other = ids.find((x) => x !== deviceId) ?? "";
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
  }, [open, monitor?.alertDeviceIds, deviceId]);

  useEffect(() => {
    if (!open || emergencyDisableLiveMapApis) return;
    const mid = monitor?.monitorDeviceId;
    if (mid == null) return;
    const ui = mid === deviceId ? "this" : mid;
    setMonitorDeviceId(ui);
    const c = configRef.current;
    if (c.monitorDeviceId !== ui) onUpdateRef.current({ ...c, monitorDeviceId: ui });
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
    setAndroidSettingsDidntOpen(false);
    setAndroidAnchorPermissionGate(false);
    setAndroidAnchorPermissionBusy(false);
    setAndroidAnchorPermissionError(null);
    setAndroidNativeDistanceM(null);
    setRolesSaveHint(null);
    setDevicesListHint(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const deg = config.angleDeg ?? ANGLE_OFF;
    const on = deg < ANGLE_OFF;
    setAngleEnabled(on);
    setAngleDeg(String(on ? deg : ANGLE_DEFAULT_ON));
  }, [open, config.angleDeg]);

  useEffect(() => {
    if (!open) return;
    if (monitor?.monitorDeviceId != null) return;
    setMonitorDeviceId(config.monitorDeviceId || "this");
  }, [open, config.monitorDeviceId, monitor?.monitorDeviceId]);

  useEffect(() => {
    if (!open) return;
    setRadius(String(config.radiusM));
  }, [open, config.radiusM]);

  useEffect(() => {
    if (!open) return;
    setAndroidNativeTestMode(readAnchorAndroidTestModeFromStorage());
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

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[5000] bg-black/60 backdrop-blur-sm flex flex-col justify-end">
      <div className="relative w-full max-h-[92vh] rounded-t-[32px] border-t border-white/[0.08] bg-[#071120] flex flex-col overflow-hidden shadow-[0_-8px_32px_rgba(0,0,0,0.5)] transition-all duration-300">
        {/* Drag Handle */}
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-white/20 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-3 border-b border-white/[0.05] shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-xl text-amber-400 border border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.15)]">⚓</span>
            <div className="text-left">
              <h3 className="text-sm font-bold text-slate-100">Anchor alert &amp; geofence</h3>
              <p className="text-[9px] text-zinc-400">Drop an anchor at your current GPS position and choose a circular geofence.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={devicesRefreshing || emergencyDisableLiveMapApis}
              onClick={() => void reloadAnchorDevices()}
              className="px-3 py-1.5 text-xs font-semibold text-emerald-400 bg-emerald-50/10 hover:bg-emerald-50/20 active:bg-emerald-500/20 border border-emerald-500/20 rounded-xl transition-all disabled:opacity-40"
            >
              {devicesRefreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-white/[0.03] active:bg-white/[0.08] border border-white/[0.05] rounded-xl transition-all"
            >
              Close
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4 pb-6 space-y-4 text-left">

          {/* Status Card */}
          {config.armed && hasAnchor ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4 flex items-center justify-between">
              <div>
                <span className="inline-flex text-[9px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/15 animate-pulse">Armed & Protecting</span>
                <h4 className="mt-2 text-sm font-bold text-slate-200">Radius: {config.radiusM}m</h4>
                <p className="text-[10px] text-zinc-400 mt-1 font-mono">{config.lat!.toFixed(5)}, {config.lng!.toFixed(5)}</p>
              </div>
              {anchorGpsQuality && anchorGpsQuality !== "ok" ? (
                <div className="text-right text-[10px] text-amber-400 font-medium max-w-[150px]">
                  {anchorGpsQuality === "poor_accuracy" ? "Drift alerts paused (poor accuracy)" : "Stabilizing GPS…"}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center justify-between">
              <div>
                <span className="inline-flex text-[9px] font-extrabold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/15">Disarmed</span>
                <h4 className="mt-2 text-sm font-bold text-slate-300">Ready to Arm</h4>
                <p className="text-[10px] text-zinc-500 mt-1">No anchor coordinates armed.</p>
              </div>
            </div>
          )}

          {/* Hint Message */}
          {hint ? (
            <p className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-200/90 shadow-sm">
              ⚠️ {hint}
            </p>
          ) : null}

          {/* Settings Fields */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/40 p-4 space-y-4">
            <label className="block text-xs font-semibold text-slate-300">
              This Device Name <span className="text-red-500">*</span>
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
                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#0e1b2f] px-3.5 py-2.5 text-sm text-slate-100 placeholder-zinc-500 outline-none focus:border-emerald-500 focus:shadow-[0_0_12px_rgba(16,185,129,0.15)] transition-all"
              />
              <span className="mt-1.5 block text-[10px] font-normal text-zinc-500 leading-normal">
                Unique name shown in device lists and warnings.
              </span>
            </label>

            <label className="block text-xs font-semibold text-slate-300">
              Telegram Chat ID <span className="text-zinc-500">(Optional)</span>
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
                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#0e1b2f] px-3.5 py-2.5 text-sm text-slate-100 placeholder-zinc-500 outline-none focus:border-emerald-500 focus:shadow-[0_0_12px_rgba(16,185,129,0.15)] transition-all"
              />
              <span className="mt-1.5 block text-[10px] font-normal text-zinc-500 leading-normal">
                Get Chat ID from{" "}
                <a href="https://telegram.me/userinfobot" target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-400 underline underline-offset-2">
                  @userinfobot
                </a>.
              </span>
            </label>
          </div>

          {/* Geofence Parameters */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/40 p-4 space-y-4">
            <label className="block text-xs font-semibold text-slate-300">
              Geofence Radius
              <select
                value={radius}
                onChange={(e) => {
                  const v = e.target.value;
                  setRadius(v);
                  onUpdate({ ...config, radiusM: parseAnchorRadiusM(Number(v), { isAdmin }), monitorDeviceId });
                }}
                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#0e1b2f] px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500 transition-all"
              >
                {anchorRadiusUiOptions.map((m) => (
                  <option key={m} value={String(m)}>
                    {m === ANCHOR_RADIUS_ADMIN_TEST_M ? "2m (admin test only)" : `${m}m`}
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block text-[10px] text-zinc-500 leading-normal">
                Alert fires if the boat drifts outside this boundary circle.
              </span>
            </label>

            <div className="border-t border-white/[0.05] pt-3">
              <label className="flex cursor-pointer items-start justify-between py-1">
                <div className="flex-1 pr-3">
                  <span className="text-xs font-semibold text-slate-300">Alert on bearing change</span>
                  <p className="text-[10px] text-zinc-500 mt-1 leading-normal">
                    Turn on to warn if direction from the anchor shifts more than the limit.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 rounded border-white/10 text-emerald-500 accent-emerald-500"
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
              </label>
              {angleEnabled ? (
                <label className="mt-3 block text-xs font-semibold text-slate-300">
                  Max bearing change (degrees)
                  <select
                    value={angleDeg}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAngleDeg(v);
                      onUpdate({ ...config, angleDeg: Number(v), monitorDeviceId });
                    }}
                    className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#0e1b2f] px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500 transition-all"
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
          </div>

          {/* Android Background Foreground Service Options */}
          {isCapacitorAndroidNative() && monitorDeviceId === "this" ? (
            <div className="rounded-2xl border border-purple-500/20 bg-purple-500/[0.03] p-4 space-y-3 text-xs leading-relaxed text-purple-200">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-purple-400 text-purple-600 accent-purple-600"
                  checked={androidNativeTestMode}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setAndroidNativeTestMode(on);
                    writeAnchorAndroidTestModeToStorage(on);
                    void setNativeAnchorTestMode(on);
                  }}
                />
                <div>
                  <span className="font-semibold text-purple-300">Native test mode (Android)</span>
                  <span className="mt-1 block text-[10px] font-normal text-zinc-400 leading-normal">
                    Uses a <strong className="font-semibold text-purple-300">5 m</strong> radius on the device.
                  </span>
                </div>
              </label>
              {androidNativeTestMode && androidNativeDistanceM != null && Number.isFinite(androidNativeDistanceM) ? (
                <p className="rounded-xl bg-purple-950/40 border border-purple-500/25 px-3 py-2 font-mono text-[11px] text-purple-300">
                  Latest native distance: {androidNativeDistanceM.toFixed(1)} m
                </p>
              ) : null}
            </div>
          ) : null}

          {showIOSPreciseHint ? (
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.03] p-4 text-xs leading-relaxed text-sky-200">
              <span className="font-semibold text-sky-300">iPhone / iPad:</span> Settings → SeaLink → Location → turn on <strong className="font-semibold text-sky-300">Precise Location</strong>. Approximate mode makes small anchor rings unreliable.
            </div>
          ) : null}

          {showAndroidPreciseHint && !showIOSPreciseHint ? (
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.03] p-4 space-y-3 text-xs leading-relaxed text-sky-200">
              <p>
                <span className="font-semibold text-sky-300">Android:</span> In system settings, allow <strong className="font-semibold text-sky-300">precise</strong> (high-accuracy) location. Approximate mode will cause false triggers.
              </p>
              <p className="text-[10px] text-zinc-400 leading-normal">
                Go to <strong className="font-semibold text-zinc-300">Settings → Apps → your browser or SeaLink → Permissions → Location</strong>.
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
                className="w-full inline-flex h-10 items-center justify-center rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98]"
              >
                Open in Android settings
              </button>
              {androidSettingsDidntOpen ? (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 mt-2 space-y-2">
                  <p className="text-[10px] leading-relaxed text-amber-200/90">
                    Settings may not have opened. Use the path above, or open the guide in Help.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href="/help#anchor-android-location"
                      className="inline-flex h-8 items-center justify-center rounded-lg bg-amber-600 px-3 text-[10px] font-semibold text-white hover:bg-amber-700 transition-colors"
                    >
                      Android location in Help
                    </Link>
                    <button
                      type="button"
                      onClick={() => setAndroidSettingsDidntOpen(false)}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.08] px-3 text-[10px] font-semibold text-zinc-300 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Two-Device Setup Card */}
          <div className="rounded-2xl border border-emerald-500/10 bg-[#0c192c]/40 p-4 space-y-4">
            <span className="inline-flex text-[9px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/15">Two signed-in devices</span>
            <p className="text-[11px] leading-relaxed text-zinc-400 font-medium">
              Choose one device to act as the monitor, and which device(s) should receive alarms.
            </p>

            {devicesListHint ? (
              <p className="rounded-xl border border-amber-500/20 bg-amber-50/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
                {devicesListHint}
              </p>
            ) : null}

            <label className="block text-xs font-semibold text-slate-300">
              1 — Monitoring Device (evaluates drift on GPS)
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
                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#0e1b2f] px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500 transition-all"
              >
                <option value="this">This device (this browser / app)</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {(d.name || "This device").trim() || "This device"}
                    {d.lastFixAt ? ` · last fix ${new Date(d.lastFixAt).toLocaleString("en-GB")}` : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block text-[10px] text-zinc-500 leading-normal">
                The monitoring device should stay open on SeaLink.
              </span>
            </label>

            <div className="border-t border-white/[0.05] pt-3 space-y-3">
              <p className="text-xs font-semibold text-slate-300">
                2 — Alarm Recipients
              </p>
              <div className="grid gap-3">
                <label className="block text-xs font-semibold text-slate-300">
                  Alert on
                  <select
                    value={alertMode}
                    onChange={(e) => setAlertMode(e.target.value as "this" | "other" | "both")}
                    className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#0e1b2f] px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500 transition-all"
                  >
                    <option value="this">This device only</option>
                    <option value="other">The other device only</option>
                    <option value="both">Both devices</option>
                  </select>
                </label>
                {alertMode !== "this" ? (
                  <label className="block text-xs font-semibold text-slate-300">
                    Other device (choose one)
                    <select
                      value={alertOtherId}
                      onChange={(e) => setAlertOtherId(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#0e1b2f] px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500 transition-all"
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
                  className="h-11 rounded-xl bg-[#0c192c] hover:bg-[#12233c] active:scale-[0.98] border border-white/[0.08] text-xs font-semibold text-slate-200 transition-all disabled:opacity-50 flex items-center justify-center cursor-pointer"
                >
                  {rolesSaveBusy ? "Saving…" : "Save monitor & alert devices"}
                </button>
                {rolesSaveHint ? (
                  <p className="text-[11px] leading-relaxed text-emerald-400 mt-1">{rolesSaveHint}</p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Android Background Foreground Service Options Dialog */}
          {androidArmNeedsBackgroundFg && androidAnchorPermissionGate ? (
            <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.03] p-4 space-y-3.5 text-xs leading-relaxed text-indigo-200">
              <p className="font-semibold text-indigo-300">Background anchor monitoring (Android app)</p>
              <p className="text-[10px] text-zinc-400 leading-normal">
                Starting background monitoring starts a foreground location service with a persistent notification.
              </p>
              <ul className="list-disc pl-4 text-[10px] text-zinc-400 space-y-1">
                <li>Location is processed locally on-device.</li>
                <li>Android will request "Always Allow" location permissions.</li>
                <li>Disarming or signing out stops the background service.</li>
              </ul>
              {androidAnchorPermissionError ? (
                <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-200">
                  {androidAnchorPermissionError}
                </p>
              ) : null}
              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={androidAnchorPermissionBusy}
                  onClick={() => setAndroidAnchorPermissionGate(false)}
                  className="flex-1 h-11 rounded-xl border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.08] text-xs font-semibold text-zinc-300 transition-all active:scale-[0.98]"
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
                      } catch (e: unknown) {
                        setAndroidAnchorPermissionError(
                          e instanceof Error ? e.message : "Could not start Android anchor monitoring.",
                        );
                      } finally {
                        setAndroidAnchorPermissionBusy(false);
                      }
                    })();
                  }}
                  className="flex-[2] h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-xs font-semibold text-white transition-all active:scale-[0.98]"
                >
                  {androidAnchorPermissionBusy ? "Working…" : "System permissions"}
                </button>
              </div>
            </div>
          ) : null}

        </div>

        {/* Action Buttons */}
        <div className="px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-white/[0.05] bg-[#071120] flex gap-3 shrink-0">
          <button
            type="button"
            disabled={!canSet || (androidArmNeedsBackgroundFg && androidAnchorPermissionGate)}
            onClick={() => {
              if (androidArmNeedsBackgroundFg && !androidAnchorPermissionGate) {
                setAndroidAnchorPermissionError(null);
                setAndroidAnchorPermissionGate(true);
                return;
              }
              void primeAnchorAlarmAudio();
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
            className="flex-1 h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-950/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
          >
            ⚡ {androidArmNeedsBackgroundFg && !androidAnchorPermissionGate
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
            className="px-5 h-14 rounded-2xl border border-white/[0.1] bg-white/[0.03] active:bg-white/[0.08] hover:text-white text-zinc-300 font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            Disarm
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
