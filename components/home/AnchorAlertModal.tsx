"use client";

import { useEffect, useMemo, useState } from "react";
import { getDeviceName, setDeviceName } from "@/lib/device-id";

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
  sharing: boolean;
  hasFix: boolean;
  pos: { lat: number; lng: number } | null;
  deviceId: string;
  config: {
    armed: boolean;
    lat: number | null;
    lng: number | null;
    radiusM: 10 | 20 | 40 | 50;
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
    radiusM: 10 | 20 | 40 | 50;
    angleDeg: number;
    monitorDeviceId: string;
  }) => void;
};

export function AnchorAlertModal({ open, onClose, sharing, hasFix, pos, deviceId, config, monitor, onUpdate }: Props) {
  const [radius, setRadius] = useState<string>(String(config.radiusM));
  const [angleDeg, setAngleDeg] = useState<string>(String(config.angleDeg ?? 360));
  const [deviceLabel, setDeviceLabel] = useState(() => (typeof window !== "undefined" ? getDeviceName() : ""));
  const [devices, setDevices] = useState<{ deviceId: string; name: string; updatedAt: string; lastFixAt: string | null }[]>([]);
  const [monitorDeviceId, setMonitorDeviceId] = useState<string>(config.monitorDeviceId || "this");
  const [alertMode, setAlertMode] = useState<"this" | "other" | "both">("both");
  const [alertOtherId, setAlertOtherId] = useState<string>("");

  const canSet = sharing && hasFix && pos != null;
  const hasAnchor = config.lat != null && config.lng != null;

  const hint = useMemo(() => {
    if (!sharing) return "Turn on “Share my location on this map” first.";
    if (!hasFix) return "Waiting for a GPS fix…";
    return null;
  }, [sharing, hasFix]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        await registerSessionDevice(deviceId);
        const r = await fetch("/api/anchor/devices", { credentials: "same-origin", cache: "no-store" });
        const d = (await r.json()) as { devices?: { deviceId: string; name: string; updatedAt: string; lastFixAt: string | null }[] };
        setDevices(Array.isArray(d.devices) ? d.devices : []);
      } catch {
        setDevices([]);
      }
    })();
  }, [open, deviceId]);

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Anchor alert</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
              Set an anchor point and we’ll warn if you drift outside the radius while the app is running.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        {hint ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            {hint}
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
                  void fetch("/api/anchor/monitor", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ alertDeviceIds: ids }),
                  });
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
            Drift distance
            <select
              value={radius}
              onChange={(e) => {
                const v = e.target.value;
                setRadius(v);
                onUpdate({ ...config, radiusM: Number(v) as 10 | 20 | 40 | 50, monitorDeviceId });
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="10">10m</option>
              <option value="20">20m</option>
              <option value="40">40m</option>
              <option value="50">50m</option>
            </select>
            <span className="mt-1 block text-[11px] text-zinc-500">Alert if the monitored device drifts beyond this distance.</span>
          </label>

          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Angle change (degrees)
            <select
              value={angleDeg}
              onChange={(e) => {
                const v = e.target.value;
                setAngleDeg(v);
                onUpdate({ ...config, angleDeg: Number(v), monitorDeviceId });
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="360">Off (360°)</option>
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
              <option value="360">360°</option>
            </select>
            <span className="mt-1 block text-[11px] text-zinc-500">
              Alert if the bearing from the anchor point changes more than this amount (360° disables).
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSet}
              onClick={() => {
                const n = (Number(radius) as 10 | 20 | 40 | 50) || config.radiusM;
                const a = Math.max(0, Math.min(360, Math.round(Number(angleDeg) || config.angleDeg || 360)));
                // Persist monitor + alert targets to server so it applies across both devices.
                const chosenMonitor = monitorDeviceId === "this" ? deviceId : monitorDeviceId;
                const ids: string[] = [];
                if (alertMode === "this" || alertMode === "both") ids.push(deviceId);
                if ((alertMode === "other" || alertMode === "both") && alertOtherId) ids.push(alertOtherId);
                void fetch("/api/anchor/monitor", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ monitorDeviceId: chosenMonitor, alertDeviceIds: ids }),
                });
                onUpdate({
                  ...config,
                  lat: pos!.lat,
                  lng: pos!.lng,
                  radiusM: n,
                  angleDeg: a,
                  armed: true,
                  monitorDeviceId,
                });
                onClose();
              }}
              className="h-9 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Set anchor at current position
            </button>
            <button
              type="button"
              disabled={!hasAnchor}
              onClick={() => onUpdate({ ...config, armed: false, monitorDeviceId })}
              className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Disarm
            </button>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">Status</p>
            <p className="mt-1">
              {config.armed && hasAnchor ? "Armed" : "Not armed"} · Distance {config.radiusM}m · Angle {config.angleDeg ?? 360}°
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
  );
}

