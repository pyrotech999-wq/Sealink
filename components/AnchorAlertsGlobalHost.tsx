"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startAnchorAlarmSiren, stopAnchorAlarmSiren } from "@/lib/anchor-alarm-sound";
import {
  clearPresentedAnchorAlertId,
  readPresentedAnchorAlertId,
  shouldReceiveAnchorAlarmPopUp,
  writePresentedAnchorAlertId,
} from "@/lib/anchor-alarm-recipient";
import { ANCHOR_LIVE_APIS_BLOCKED } from "@/lib/anchor-live-client-flags";
import { clearNativeAndroidAnchorAlarm, isCapacitorAndroidNative } from "@/lib/capacitor-anchor-alert-android";
import {
  createAnchorResetNetworkAbort,
  effectiveMonitorDeviceIdFromServer,
  isAnchorResetAbortError,
  resolveAnchorResetCentreCoordinates,
} from "@/lib/anchor-reset-centre-client";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { isBareMetaDataDeletionPage } from "@/lib/messaging-chrome-paths";
import { type LatLng as AnchorResetLatLng } from "@/lib/anchor-reset-gps";
import { anchorRadiusAfterAddingMeters } from "@/lib/anchor-alert-storage";
import { ANCHOR_COMMAND_STALE_BOAT_ERROR } from "@/lib/anchor-command-constants";
import {
  ANCHOR_DEVICE_ID_HEADER,
  type AnchorRemoteCommandPostDebug,
  enqueueAndAwaitAnchorCommand,
  postAnchorSessionCommand,
} from "@/lib/anchor-commands-client";

const POLL_MS = 20_000;

async function fetchAnchorDeviceNameMap(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  try {
    const r = await fetch("/api/anchor/devices", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) return m;
    const j = (await r.json()) as { devices?: { deviceId: string; name: string }[] };
    for (const d of j.devices ?? []) {
      const id = typeof d.deviceId === "string" ? d.deviceId.trim() : "";
      if (!id) continue;
      const nm = typeof d.name === "string" ? d.name.replace(/\r\n/g, " ").trim() : "";
      m.set(id, nm || `Device ${id.slice(0, 8)}…`);
    }
  } catch {
    /* ignore */
  }
  return m;
}

/** `sessionId` is `uid|lat|lng` — show coordinates, not the raw account prefix. */
function summarizeSessionFingerprint(sessionId: string | null): string | null {
  if (!sessionId?.trim()) return null;
  const parts = sessionId.split("|");
  if (parts.length >= 3) {
    return `Armed anchor centre ≈ ${parts[1]}, ${parts[2]} (commands match this ring only)`;
  }
  return null;
}

type AlertRow = { id: string; message: string; createdAt: string };

/**
 * Polls anchor inbox on every signed-in route so the **receiving** phone gets alarms without staying on the map.
 * De-duplicates with {@link HomeLocationMap} via `sessionStorage` so the same server alert does not open twice.
 */
export function AnchorAlertsGlobalHost() {
  const pathname = usePathname();
  const deviceId = useMemo(
    () => (typeof window !== "undefined" ? getOrCreateDeviceId() : ""),
    [],
  );
  const [alert, setAlert] = useState<AlertRow | null>(null);
  const alertRef = useRef<AlertRow | null>(null);
  const [alarmBlocked, setAlarmBlocked] = useState(false);
  const [resetBusyKind, setResetBusyKind] = useState<null | "reset" | "increase" | "silence">(null);
  const [confirmDisarm, setConfirmDisarm] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [remoteAnchorCmdDebug, setRemoteAnchorCmdDebug] = useState(false);
  const [remoteAnchorCmdDebugJson, setRemoteAnchorCmdDebugJson] = useState<string | null>(null);
  /** Last remote anchor action: POST fields + optional terminal poll status + resolved device labels. */
  const [remoteAnchorActionDebug, setRemoteAnchorActionDebug] = useState<
    | (AnchorRemoteCommandPostDebug & {
        terminalStatus?: string;
        error?: string;
        targetDeviceName?: string;
        sourceDeviceName?: string;
        sessionSummary?: string;
      })
    | null
  >(null);

  const applyRemoteActionDebugWithNames = useCallback(
    async (
      post: AnchorRemoteCommandPostDebug,
      outcome: { ok: true; terminalStatus: string } | { ok: false; error: string },
    ) => {
      const names = await fetchAnchorDeviceNameMap();
      const sessionSummary = summarizeSessionFingerprint(post.sessionId);
      const deviceLabel = (id: string | null | undefined) => {
        if (!id?.trim()) return undefined;
        const n = names.get(id.trim())?.trim();
        return n && n.length > 0 ? n : `Not in device list (${id.trim().slice(0, 8)}…)`;
      };
      setRemoteAnchorActionDebug({
        ...post,
        terminalStatus: outcome.ok ? outcome.terminalStatus : undefined,
        error: outcome.ok ? undefined : outcome.error,
        ...(post.targetDeviceId ? { targetDeviceName: deviceLabel(post.targetDeviceId) } : {}),
        ...(post.sourceDeviceId ? { sourceDeviceName: deviceLabel(post.sourceDeviceId) } : {}),
        ...(sessionSummary ? { sessionSummary } : {}),
      });
    },
    [],
  );

  useEffect(() => {
    const read = () => {
      try {
        setRemoteAnchorCmdDebug(typeof window !== "undefined" && localStorage.getItem("sealink_remote_anchor_cmd_debug") === "1");
      } catch {
        setRemoteAnchorCmdDebug(false);
      }
    };
    read();
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sealink_remote_anchor_cmd_debug" || e.key === null) read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const applyGeofenceResetAndDismiss = useCallback(
    async (fix: AnchorResetLatLng, seenId: string, opts?: { signal?: AbortSignal }): Promise<void> => {
      const signal = opts?.signal;
      if (!ANCHOR_LIVE_APIS_BLOCKED) {
        try {
          await fetch("/api/anchor/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seenId }),
            credentials: "same-origin",
            ...(signal ? { signal } : {}),
          });
          await fetch("/api/anchor/geofence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            ...(signal ? { signal } : {}),
            body: JSON.stringify({
              lat: fix.lat,
              lng: fix.lng,
              lastAlertAt: null,
              lastBearingDeg: null,
              remoteAlarmSilencedUntilReset: false,
            }),
          });
        } catch (e) {
          if (isAnchorResetAbortError(e)) throw e;
          setResetError("Could not save the new anchor. Check your connection and try again.");
          throw new Error("save");
        }
      }
      clearPresentedAnchorAlertId();
      setAlert(null);
    },
    [],
  );

  useEffect(() => {
    alertRef.current = alert;
  }, [alert]);

  useEffect(() => {
    setResetError(null);
  }, [alert?.id]);

  useEffect(() => {
    if (ANCHOR_LIVE_APIS_BLOCKED) return;
    if (typeof window === "undefined") return;
    if (isBareMetaDataDeletionPage(pathname)) return;
    if (!deviceId || deviceId === "server") return;

    let disposed = false;

    const tick = async () => {
      if (disposed) return;
      try {
        const me = await fetch("/api/demo/me", { credentials: "same-origin", cache: "no-store" });
        if (!me.ok) {
          if (disposed) return;
          setAlert(null);
          return;
        }
        const mj = (await me.json()) as { signedIn?: boolean };
        if (!mj.signedIn) {
          if (disposed) return;
          setAlert(null);
          return;
        }

        const mr = await fetch("/api/anchor/monitor", { credentials: "same-origin", cache: "no-store" });
        if (!mr.ok) return;
        const md = (await mr.json()) as { config?: { alertDeviceIds?: string[]; monitorDeviceId?: string | null } };
        const alertDeviceIds = Array.isArray(md?.config?.alertDeviceIds) ? md.config!.alertDeviceIds : [];
        if (!shouldReceiveAnchorAlarmPopUp(alertDeviceIds, deviceId)) {
          if (disposed) return;
          if (alertRef.current) {
            stopAnchorAlarmSiren();
            setAlarmBlocked(false);
            clearPresentedAnchorAlertId();
            setAlert(null);
          }
          return;
        }

        const ar = await fetch("/api/anchor/alerts", { credentials: "same-origin", cache: "no-store" });
        if (!ar.ok) return;
        const ad = (await ar.json()) as { alerts?: AlertRow[] };
        const list = Array.isArray(ad.alerts) ? ad.alerts : [];
        if (disposed) return;
        const first = list[0];
        if (!first) {
          if (alertRef.current) {
            stopAnchorAlarmSiren();
            setAlarmBlocked(false);
            clearPresentedAnchorAlertId();
            setAlert(null);
          }
          return;
        }

        const mapAnchorModalOpen =
          typeof document !== "undefined" && document.getElementById("sealink-anchor-alarm-title") != null;
        if (mapAnchorModalOpen && readPresentedAnchorAlertId() === first.id && alertRef.current?.id !== first.id) {
          return;
        }
        if (alertRef.current?.id === first.id) return;

        writePresentedAnchorAlertId(first.id);
        setAlert(first);

        try {
          if (typeof document !== "undefined" && document.visibilityState !== "visible") {
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("SEALINK — ANCHOR ALERT", {
                body: first.message.slice(0, 200),
                tag: "sealink-anchor-alert-global",
                renotify: true,
              } as NotificationOptions);
            }
          }
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      disposed = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pathname, deviceId]);

  async function startAlarm(): Promise<void> {
    stopAnchorAlarmSiren();
    const ok = await startAnchorAlarmSiren();
    if (!ok) {
      setAlarmBlocked(true);
      return;
    }
    setAlarmBlocked(false);
  }

  useEffect(() => {
    if (!alert) {
      stopAnchorAlarmSiren();
      queueMicrotask(() => setAlarmBlocked(false));
      return;
    }
    queueMicrotask(() => void startAlarm());
    return () => stopAnchorAlarmSiren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert?.id]);

  if (!alert) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="sealink-anchor-global-title"
      aria-describedby="sealink-anchor-global-detail"
      className="sealink-anchor-siren-overlay fixed inset-0 z-[1210] flex flex-col shadow-[inset_0_0_80px_rgba(0,0,0,0.35)]"
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))] text-center">
        <p
          id="sealink-anchor-global-title"
          className="text-4xl font-black uppercase leading-none tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] sm:text-5xl"
        >
          Anchor alarm
        </p>
        <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-amber-200">Geofence breach — check the boat</p>
        <p id="sealink-anchor-global-detail" className="mt-6 max-w-lg text-lg font-semibold leading-snug text-white sm:text-xl">
          {alert.message}
        </p>
        <p className="mt-4 text-xs font-medium text-white/80">{new Date(alert.createdAt).toLocaleString("en-GB")}</p>
        {alarmBlocked ? (
          <button
            type="button"
            onClick={() => void startAlarm()}
            className="mt-6 rounded-xl border-2 border-white/90 bg-black/25 px-5 py-3 text-sm font-bold text-white backdrop-blur-sm hover:bg-black/40"
          >
            Tap to play alarm sound
          </button>
        ) : null}
        {resetError ? (
          <p className="mt-4 max-w-md rounded-lg border border-amber-500/50 bg-amber-950/40 px-3 py-2 text-xs leading-snug text-amber-100">
            {resetError}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-3 border-t-2 border-white/25 bg-black/35 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:flex-row sm:justify-center">
        <button
          type="button"
          disabled={resetBusyKind !== null}
          onClick={() => {
            stopAnchorAlarmSiren();
            if (isCapacitorAndroidNative()) void clearNativeAndroidAnchorAlarm();
            const seenId = alert.id;
            void (async () => {
              setResetError(null);
              setRemoteAnchorActionDebug(null);
              setResetBusyKind("reset");
              const { signal, clear } = createAnchorResetNetworkAbort(120_000);
              try {
                const [mr, gr] = await Promise.all([
                  fetch("/api/anchor/monitor", { credentials: "same-origin", cache: "no-store", signal }),
                  fetch("/api/anchor/geofence", { credentials: "same-origin", cache: "no-store", signal }),
                ]);
                let mj: { config?: { monitorDeviceId?: string | null } } | null = null;
                let gj: { config?: { monitorDeviceId?: string } } | null = null;
                if (mr.ok) mj = (await mr.json()) as { config?: { monitorDeviceId?: string | null } };
                if (gr.ok) gj = (await gr.json()) as { config?: { monitorDeviceId?: string } };
                if (!mr.ok && !gr.ok) {
                  const hint =
                    mr.status === 401 || gr.status === 401
                      ? "Try opening SeaLink in the browser again and signing in."
                      : "Check Wi‑Fi or mobile data, then retry.";
                  setResetError(
                    `Could not load anchor settings (monitor ${mr.status}, geofence ${gr.status}). ${hint} You can still try “Increase geofence” or “Silence until anchor reset”.`,
                  );
                  return;
                }
                const effective = effectiveMonitorDeviceIdFromServer({
                  serverMonitorDeviceId: mj?.config?.monitorDeviceId,
                  geofenceMonitorDeviceId: gj?.config?.monitorDeviceId,
                });
                if (!effective) {
                  setResetError(
                    "SeaLink does not know which device is monitoring yet. On the boat phone, open Anchor alarm, tap Save on monitor & alert devices, then try again here.",
                  );
                  return;
                }
                if (effective === deviceId) {
                  const fix = await resolveAnchorResetCentreCoordinates({
                    thisDeviceId: deviceId,
                    effectiveMonitorDeviceId: effective,
                    mapPosIfThisDeviceIsMonitor: null,
                    allowBrowserGpsFallback: true,
                    signal,
                  });
                  if (!fix) {
                    setResetError(
                      "No recent GPS for this monitoring handset. Open Anchor alarm on the map, wait for a fix, or tap Mark seen.",
                    );
                    return;
                  }
                  await applyGeofenceResetAndDismiss(fix, seenId, { signal });
                } else {
                  const r = await enqueueAndAwaitAnchorCommand({
                    type: "RESET_ANCHOR",
                    callerDeviceId: deviceId,
                    signal,
                    onWaitingForBoat: () => setResetError("Waiting for boat device…"),
                  });
                  await applyRemoteActionDebugWithNames(
                    r.postDebug,
                    r.ok ? { ok: true, terminalStatus: r.terminalStatus } : { ok: false, error: r.error },
                  );
                  if (!r.ok) {
                    setResetError(r.error);
                    return;
                  }
                  if (!ANCHOR_LIVE_APIS_BLOCKED) {
                    try {
                      await fetch("/api/anchor/alerts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ seenId }),
                        credentials: "same-origin",
                        signal,
                      });
                    } catch {
                      /* ignore */
                    }
                  }
                  clearPresentedAnchorAlertId();
                  setAlert(null);
                  setResetError(null);
                }
              } catch (e) {
                if (e instanceof Error && e.message === "save") return;
                if (isAnchorResetAbortError(e)) {
                  setResetError("Request timed out. Check your connection, or open Anchor alarm on the map.");
                } else {
                  setResetError(e instanceof Error ? e.message : "Unexpected error.");
                }
              } finally {
                clear();
                setResetBusyKind(null);
              }
            })();
          }}
          className="h-14 w-full rounded-xl bg-emerald-500 text-base font-bold text-white shadow-lg hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
        >
          {resetBusyKind === "reset" ? "Working…" : resetBusyKind != null ? "Please wait…" : "Reset anchor at boat GPS"}
        </button>
        <button
          type="button"
          disabled={resetBusyKind !== null || ANCHOR_LIVE_APIS_BLOCKED}
          onClick={() => {
            void (async () => {
              setResetError(null);
              setRemoteAnchorActionDebug(null);
              setResetBusyKind("increase");
              const { signal, clear } = createAnchorResetNetworkAbort(120_000);
              try {
                const [mr, gr] = await Promise.all([
                  fetch("/api/anchor/monitor", { credentials: "same-origin", cache: "no-store", signal }),
                  fetch("/api/anchor/geofence", { credentials: "same-origin", cache: "no-store", signal }),
                ]);
                let mj: { config?: { monitorDeviceId?: string | null } } | null = null;
                let gj: { config?: { monitorDeviceId?: string; radiusM?: unknown } } | null = null;
                if (mr.ok) mj = (await mr.json()) as { config?: { monitorDeviceId?: string | null } };
                if (gr.ok) gj = (await gr.json()) as { config?: { monitorDeviceId?: string; radiusM?: unknown } };
                if (!mr.ok && !gr.ok) {
                  setResetError(`Could not load settings (monitor ${mr.status}, geofence ${gr.status}).`);
                  return;
                }
                const effective = effectiveMonitorDeviceIdFromServer({
                  serverMonitorDeviceId: mj?.config?.monitorDeviceId,
                  geofenceMonitorDeviceId: gj?.config?.monitorDeviceId,
                });
                if (!effective) {
                  setResetError("Monitoring device is not configured yet. Open Anchor alarm on the boat phone first.");
                  return;
                }
                if (effective === deviceId) {
                  if (!gr.ok) {
                    setResetError("Could not read geofence for radius.");
                    return;
                  }
                  const curR = gj?.config?.radiusM;
                  const nextR = anchorRadiusAfterAddingMeters(curR, 10, { fromTrustedStore: true });
                  const pr = await fetch("/api/anchor/geofence", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    signal,
                    body: JSON.stringify({ radiusM: nextR }),
                  });
                  if (!pr.ok) {
                    setResetError(`Could not save new radius (${pr.status}).`);
                    return;
                  }
                  setResetError(`Done: allowed swing is now ${nextR} m (anchor centre unchanged). Tap Mark seen to stop this alarm.`);
                } else {
                  const r = await enqueueAndAwaitAnchorCommand({
                    type: "INCREASE_RADIUS",
                    meters: 10,
                    callerDeviceId: deviceId,
                    signal,
                    onWaitingForBoat: () => setResetError("Waiting for boat device…"),
                  });
                  await applyRemoteActionDebugWithNames(
                    r.postDebug,
                    r.ok ? { ok: true, terminalStatus: r.terminalStatus } : { ok: false, error: r.error },
                  );
                  if (!r.ok) {
                    setResetError(r.error);
                    return;
                  }
                  const seenId = alert.id;
                  if (!ANCHOR_LIVE_APIS_BLOCKED) {
                    try {
                      await fetch("/api/anchor/alerts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ seenId }),
                        credentials: "same-origin",
                        signal,
                      });
                    } catch {
                      /* ignore */
                    }
                  }
                  clearPresentedAnchorAlertId();
                  setAlert(null);
                  setResetError(null);
                }
              } catch (e) {
                if (isAnchorResetAbortError(e)) {
                  setResetError("That took too long. Check connection, then try again.");
                } else {
                  setResetError(e instanceof Error ? e.message : "Unexpected error.");
                }
              } finally {
                clear();
                setResetBusyKind(null);
              }
            })();
          }}
          className="h-12 w-full rounded-xl border border-sky-300/80 bg-sky-950/45 text-sm font-bold text-sky-50 hover:bg-sky-900/55 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
        >
          {resetBusyKind === "increase" ? "Working…" : "Increase geofence (+10 m)"}
        </button>
        {confirmDisarm ? (
          <div className="flex w-full flex-col gap-2 rounded-xl border border-amber-400/70 bg-amber-950/50 px-4 py-3 sm:max-w-xs">
            <p className="text-sm font-bold text-amber-100">Turn off anchor monitoring?</p>
            <p className="text-xs leading-snug text-amber-200/90">This will disarm the anchor alarm on all devices. You will need to re-arm from the anchor settings.</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={resetBusyKind !== null}
                onClick={() => {
                  void (async () => {
                    setResetError(null);
                    setRemoteAnchorActionDebug(null);
                    setResetBusyKind("silence");
                    try {
                      const gr = await fetch("/api/anchor/geofence", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "same-origin",
                        body: JSON.stringify({ armed: false, remoteAlarmSilencedUntilReset: false, lastAlertAt: null }),
                      });
                      if (!gr.ok) {
                        setResetError(`Could not disarm (${gr.status}).`);
                        return;
                      }
                      await fetch("/api/anchor/alerts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "same-origin",
                        body: JSON.stringify({ markAllSeen: true }),
                      }).catch(() => undefined);
                      stopAnchorAlarmSiren();
                      if (isCapacitorAndroidNative()) void clearNativeAndroidAnchorAlarm();
                      clearPresentedAnchorAlertId();
                      setAlert(null);
                      setConfirmDisarm(false);
                    } catch (e) {
                      if (isAnchorResetAbortError(e)) {
                        setResetError("That took too long. Check connection, then try again.");
                      } else {
                        setResetError(e instanceof Error ? e.message : "Unexpected error.");
                      }
                    } finally {
                      setResetBusyKind(null);
                    }
                  })();
                }}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {resetBusyKind === "silence" ? "Working…" : "Yes, turn off"}
              </button>
              <button
                type="button"
                disabled={resetBusyKind !== null}
                onClick={() => setConfirmDisarm(false)}
                className="flex-1 rounded-lg border border-white/40 bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={resetBusyKind !== null || ANCHOR_LIVE_APIS_BLOCKED}
            onClick={() => setConfirmDisarm(true)}
            className="h-12 w-full rounded-xl border border-zinc-400/90 bg-zinc-800/80 text-sm font-bold text-zinc-100 hover:bg-zinc-700/90 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
          >
            Turn off anchor monitoring
          </button>
        )}
        {remoteAnchorActionDebug ? (
          <div className="pointer-events-auto mx-auto mt-2 max-w-lg rounded-lg border border-cyan-500/50 bg-cyan-950/40 px-3 py-2 text-left">
            <div className="text-[10px] font-bold uppercase tracking-wide text-cyan-200">Remote command POST (last action)</div>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[9px] text-cyan-50">
              {JSON.stringify(remoteAnchorActionDebug, null, 2)}
            </pre>
            {remoteAnchorActionDebug?.error === ANCHOR_COMMAND_STALE_BOAT_ERROR ? (
              <p className="mt-2 text-[9px] leading-snug text-cyan-100/95">
                The monitoring phone must keep SeaLink open (foreground or a tab that is not sleeping) so it can poll
                for commands every few seconds. Try again with the boat device on the map screen.
              </p>
            ) : null}
          </div>
        ) : null}
        {remoteAnchorCmdDebug && alert ? (
          <div className="pointer-events-auto mx-auto max-w-lg rounded-lg border border-amber-400/60 bg-amber-950/50 px-3 py-2 text-left font-mono text-[10px] text-amber-100">
            <div className="font-bold text-amber-200">Remote anchor command debug</div>
            <p className="mt-1 text-[9px] opacity-90">
              Enable: <code className="rounded bg-black/40 px-1">localStorage.setItem(&quot;sealink_remote_anchor_cmd_debug&quot;,&quot;1&quot;)</code> then reload.
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <button
                type="button"
                disabled={!deviceId || deviceId === "server" || resetBusyKind !== null}
                className="rounded bg-amber-500 px-2 py-1 text-[10px] font-bold text-black disabled:opacity-50"
                onClick={() => {
                  void (async () => {
                    setRemoteAnchorCmdDebugJson(null);
                    const r = await fetch("/api/anchor/commands?role=monitor", {
                      credentials: "same-origin",
                      cache: "no-store",
                      headers: { [ANCHOR_DEVICE_ID_HEADER]: deviceId },
                    });
                    const t = await r.text();
                    setRemoteAnchorCmdDebugJson(JSON.stringify({ httpStatus: r.status, body: t.slice(0, 16_000) }, null, 2));
                  })();
                }}
              >
                GET monitor poll (this device as header — use on monitor phone)
              </button>
              <button
                type="button"
                disabled={!deviceId || deviceId === "server" || resetBusyKind !== null}
                className="rounded bg-sky-500 px-2 py-1 text-[10px] font-bold text-black disabled:opacity-50"
                onClick={() => {
                  void (async () => {
                    setRemoteAnchorCmdDebugJson(null);
                    const posted = await postAnchorSessionCommand({
                      type: "INCREASE_RADIUS",
                      meters: 10,
                      callerDeviceId: deviceId,
                    });
                    setRemoteAnchorCmdDebugJson(JSON.stringify(posted, null, 2));
                  })();
                }}
              >
                Create test increase-radius command
              </button>
            </div>
            {remoteAnchorCmdDebugJson ? (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[9px] text-amber-50">{remoteAnchorCmdDebugJson}</pre>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          disabled={resetBusyKind !== null}
          onClick={() => {
            stopAnchorAlarmSiren();
            if (isCapacitorAndroidNative()) void clearNativeAndroidAnchorAlarm();
            const id = alert.id;
            void (async () => {
              if (!ANCHOR_LIVE_APIS_BLOCKED) {
                try {
                  await fetch("/api/anchor/alerts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ seenId: id }),
                    credentials: "same-origin",
                  });
                } catch {
                  /* ignore */
                }
              }
              clearPresentedAnchorAlertId();
              setAlert(null);
            })();
          }}
          className="h-14 w-full rounded-xl border-2 border-white bg-white/95 text-base font-bold text-red-700 shadow-lg hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
        >
          Mark seen (stop alarm)
        </button>
      </div>
      <p className="bg-black/40 px-4 py-2 text-center text-[11px] text-white/75">
        Leave SeaLink signed in on this device (even in the background) so it can pick up alerts from your monitoring phone.
        <span className="mt-1 block opacity-90">
          <strong className="text-white/90">Reset anchor at boat GPS</strong> moves the ring to the monitoring
          handset’s position. <strong className="text-white/90">Increase geofence</strong> widens the allowed radius
          by 10&nbsp;m. <strong className="text-white/90">Turn off anchor monitoring</strong> disarms the anchor alarm
          on all devices. <strong className="text-white/90">Mark seen</strong> stops the alarm here without moving the ring.
        </span>
      </p>
    </div>
  );
}
