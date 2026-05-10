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
import { getGpsFixForAnchorReset, type LatLng as AnchorResetLatLng } from "@/lib/anchor-reset-gps";
import { nextLargerStandardAnchorRadiusM } from "@/lib/anchor-alert-storage";

const POLL_MS = 20_000;

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
  const [resetBusyKind, setResetBusyKind] = useState<null | "monitor" | "this" | "radius" | "mute">(null);
  const [resetError, setResetError] = useState<string | null>(null);

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

        const mr = await fetch("/api/anchor/monitor", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!mr.ok) return;
        const md = (await mr.json()) as { config?: { alertDeviceIds?: string[] } };
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
              setResetBusyKind("monitor");
              const { signal, clear } = createAnchorResetNetworkAbort();
              try {
                const mr = await fetch("/api/anchor/monitor", {
                  credentials: "same-origin",
                  cache: "no-store",
                  signal,
                });
                const gr = await fetch("/api/anchor/geofence", {
                  credentials: "same-origin",
                  cache: "no-store",
                  signal,
                });
                let mj: { config?: { monitorDeviceId?: string | null } } | null = null;
                let gj: { config?: { monitorDeviceId?: string } } | null = null;
                if (mr.ok) {
                  mj = (await mr.json()) as { config?: { monitorDeviceId?: string | null } };
                }
                if (gr.ok) {
                  gj = (await gr.json()) as { config?: { monitorDeviceId?: string } };
                }
                if (!mr.ok && !gr.ok) {
                  const hint =
                    mr.status === 401 || gr.status === 401
                      ? "Try opening SeaLink in the browser again and signing in."
                      : "Check Wi‑Fi or mobile data, then retry.";
                  setResetError(
                    `Could not load anchor settings (monitor ${mr.status}, geofence ${gr.status}). ${hint} You can still try “Allow wider swing” or “Mute alerts here”.`,
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
                const fix = await resolveAnchorResetCentreCoordinates({
                  thisDeviceId: deviceId,
                  effectiveMonitorDeviceId: effective,
                  mapPosIfThisDeviceIsMonitor: null,
                  allowBrowserGpsFallback: false,
                  signal,
                });
                if (!fix) {
                  setResetError(
                    "No recent GPS for the monitoring device. Use “This phone’s GPS” below, open Anchor alarm on the map, or tap Mark seen.",
                  );
                  return;
                }
                await applyGeofenceResetAndDismiss(fix, seenId, { signal });
              } catch (e) {
                if (e instanceof Error && e.message === "save") return;
                if (isAnchorResetAbortError(e)) {
                  setResetError(
                    "Request timed out. Try “This phone’s GPS”, check your connection, or open Anchor alarm.",
                  );
                }
              } finally {
                clear();
                setResetBusyKind(null);
              }
            })();
          }}
          className="h-14 w-full rounded-xl bg-emerald-500 text-base font-bold text-white shadow-lg hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
        >
          {resetBusyKind === "monitor"
            ? "Loading monitor position…"
            : resetBusyKind != null
              ? "Please wait…"
              : "Reset at monitor position"}
        </button>
        <button
          type="button"
          disabled={resetBusyKind !== null}
          onClick={() => {
            stopAnchorAlarmSiren();
            if (isCapacitorAndroidNative()) void clearNativeAndroidAnchorAlarm();
            const seenId = alert.id;
            void (async () => {
              setResetError(null);
              setResetBusyKind("this");
              const { signal, clear } = createAnchorResetNetworkAbort(45_000);
              try {
                const fix = await getGpsFixForAnchorReset(null);
                if (!fix) {
                  setResetError(
                    "Could not read GPS on this phone (permission, timeout, or no signal). Allow location for SeaLink, try outdoors, or use Mark seen.",
                  );
                  return;
                }
                await applyGeofenceResetAndDismiss(fix, seenId, { signal });
              } catch (e) {
                if (e instanceof Error && e.message === "save") return;
                if (isAnchorResetAbortError(e)) {
                  setResetError(
                    "Request timed out while saving. Check your connection, try again, or use Mark seen.",
                  );
                }
              } finally {
                clear();
                setResetBusyKind(null);
              }
            })();
          }}
          className="h-14 w-full rounded-xl border-2 border-emerald-300/90 bg-emerald-950/50 text-base font-bold text-emerald-50 shadow-lg hover:bg-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
        >
          {resetBusyKind === "this" ? "Getting this phone’s GPS…" : "This phone’s GPS"}
        </button>
        <button
          type="button"
          disabled={resetBusyKind !== null || ANCHOR_LIVE_APIS_BLOCKED}
          onClick={() => {
            void (async () => {
              setResetError(null);
              setResetBusyKind("radius");
              const { signal, clear } = createAnchorResetNetworkAbort();
              try {
                const gr = await fetch("/api/anchor/geofence", {
                  credentials: "same-origin",
                  cache: "no-store",
                  signal,
                });
                if (!gr.ok) {
                  setResetError(
                    gr.status === 401
                      ? "Sign-in required to change radius. Open SeaLink signed in, then try again."
                      : `Could not read geofence (${gr.status}). Check connection.`,
                  );
                  return;
                }
                const body = (await gr.json()) as { config?: { radiusM?: unknown } };
                const curR = body.config?.radiusM;
                const nextR = nextLargerStandardAnchorRadiusM(curR, { fromTrustedStore: true });
                if (nextR == null) {
                  setResetError("Already at the widest standard radius (200 m). Open Anchor alarm on the map for more options.");
                  return;
                }
                const pr = await fetch("/api/anchor/geofence", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "same-origin",
                  signal,
                  body: JSON.stringify({ radiusM: nextR }),
                });
                if (!pr.ok) {
                  setResetError(`Could not save new radius (${pr.status}). Try again from Anchor alarm on the map.`);
                  return;
                }
                setResetError(
                  `Done: allowed swing is now ${nextR} m (anchor centre unchanged). Mark seen still turns off this alarm sound.`,
                );
              } catch (e) {
                if (isAnchorResetAbortError(e)) {
                  setResetError("That took too long. Check connection, then try again.");
                }
              } finally {
                clear();
                setResetBusyKind(null);
              }
            })();
          }}
          className="h-12 w-full rounded-xl border border-sky-300/80 bg-sky-950/45 text-sm font-bold text-sky-50 hover:bg-sky-900/55 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
        >
          {resetBusyKind === "radius" ? "Updating radius…" : "Allow wider swing"}
        </button>
        <button
          type="button"
          disabled={resetBusyKind !== null || ANCHOR_LIVE_APIS_BLOCKED}
          onClick={() => {
            if (
              !window.confirm(
                "Stop fullscreen anchor alarms on this phone only? The monitoring handset can still alarm. You can turn alerts back on later in Anchor alarm → Monitor & alert devices.",
              )
            ) {
              return;
            }
            void (async () => {
              if (!deviceId || deviceId === "server") {
                setResetError("This page does not have a device id yet. Reload SeaLink, then try again.");
                return;
              }
              setResetError(null);
              setResetBusyKind("mute");
              const { signal, clear } = createAnchorResetNetworkAbort();
              try {
                const mr = await fetch("/api/anchor/monitor", {
                  credentials: "same-origin",
                  cache: "no-store",
                  signal,
                });
                if (!mr.ok) {
                  setResetError(
                    mr.status === 401
                      ? "Sign-in required. Open SeaLink signed in, then try again."
                      : `Could not load who receives alerts (${mr.status}). Open Anchor alarm on the map to change alert devices.`,
                  );
                  return;
                }
                const mj = (await mr.json()) as { config?: { alertDeviceIds?: string[] } };
                const dr = await fetch("/api/anchor/devices", {
                  credentials: "same-origin",
                  cache: "no-store",
                  signal,
                });
                if (!dr.ok) {
                  setResetError(`Could not list devices (${dr.status}). Try again or use Open map & anchor.`);
                  return;
                }
                const d = (await dr.json()) as { devices?: { deviceId: string }[] };
                const allIds = (Array.isArray(d.devices) ? d.devices : []).map((x) => x.deviceId).filter(Boolean);
                const curIds = Array.isArray(mj.config?.alertDeviceIds) ? mj.config!.alertDeviceIds : [];
                const nextIds =
                  curIds.length > 0
                    ? curIds.filter((id) => id !== deviceId)
                    : allIds.filter((id) => id !== deviceId);
                if (nextIds.length < 1) {
                  setResetError(
                    "Cannot mute this phone: it is the only handset on the alert list. Add another device under Anchor alarm first, or use Mark seen.",
                  );
                  return;
                }
                const save = await fetch("/api/anchor/monitor", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "same-origin",
                  signal,
                  body: JSON.stringify({ alertDeviceIds: nextIds }),
                });
                if (!save.ok) {
                  setResetError(`Could not save alert list (${save.status}). Try Anchor alarm on the map.`);
                  return;
                }
                stopAnchorAlarmSiren();
                if (isCapacitorAndroidNative()) void clearNativeAndroidAnchorAlarm();
                clearPresentedAnchorAlertId();
                setAlert(null);
              } catch (e) {
                if (isAnchorResetAbortError(e)) {
                  setResetError("That took too long. Check connection, then try again.");
                }
              } finally {
                clear();
                setResetBusyKind(null);
              }
            })();
          }}
          className="h-12 w-full rounded-xl border border-zinc-400/90 bg-zinc-800/80 text-sm font-bold text-zinc-100 hover:bg-zinc-700/90 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
        >
          {resetBusyKind === "mute" ? "Updating…" : "Mute alerts on this phone"}
        </button>
        <a
          href="/anchor-alarm"
          aria-disabled={resetBusyKind !== null}
          className={`inline-flex h-14 w-full items-center justify-center rounded-xl border-2 border-white/80 bg-white/10 px-4 text-base font-bold text-white hover:bg-white/20 sm:max-w-xs ${resetBusyKind != null ? "pointer-events-none opacity-50" : ""}`}
          onClick={(e) => {
            if (resetBusyKind != null) {
              e.preventDefault();
              return;
            }
            stopAnchorAlarmSiren();
            if (isCapacitorAndroidNative()) void clearNativeAndroidAnchorAlarm();
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            window.location.assign("/anchor-alarm");
          }}
        >
          Open map &amp; anchor
        </a>
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
          <strong className="text-white/90">Reset at monitor position</strong> keeps the same radius and moves the orange
          ring to the <strong className="text-white/90">monitoring device’s</strong> latest GPS (from the server), then
          clears this alert. <strong className="text-white/90">This phone’s GPS</strong> does the same using{" "}
          <em className="not-italic text-white/85">this</em> handset’s location if the boat phone has no server fix.{" "}
          <strong className="text-white/90">Mark seen</strong> stops the alarm without moving the ring.{" "}
          <strong className="text-white/90">Allow wider swing</strong> bumps the allowed radius on the server (centre
          unchanged). <strong className="text-white/90">Mute alerts on this phone</strong> removes this handset from the
          alert list so it won&apos;t get future fullscreen anchor alarms (change back in Anchor alarm).
        </span>
      </p>
    </div>
  );
}
