"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  effectiveMonitorDeviceIdFromServer,
  resolveAnchorResetCentreCoordinates,
} from "@/lib/anchor-reset-centre-client";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { isBareMetaDataDeletionPage } from "@/lib/messaging-chrome-paths";

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
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

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

    let disposed = false;
    const deviceId = getOrCreateDeviceId();
    if (!deviceId || deviceId === "server") return;

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

        if (readPresentedAnchorAlertId() === first.id && alertRef.current?.id !== first.id) {
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
  }, [pathname]);

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
          disabled={resetBusy}
          onClick={() => {
            stopAnchorAlarmSiren();
            if (isCapacitorAndroidNative()) void clearNativeAndroidAnchorAlarm();
            const seenId = alert.id;
            void (async () => {
              setResetError(null);
              setResetBusy(true);
              try {
                const [mr, gr] = await Promise.all([
                  fetch("/api/anchor/monitor", { credentials: "same-origin", cache: "no-store" }),
                  fetch("/api/anchor/geofence", { credentials: "same-origin", cache: "no-store" }),
                ]);
                if (!mr.ok || !gr.ok) {
                  setResetError("Could not load anchor settings. Check your connection and try again.");
                  return;
                }
                const mj = (await mr.json()) as { config?: { monitorDeviceId?: string | null } };
                const gj = (await gr.json()) as { config?: { monitorDeviceId?: string } };
                const effective = effectiveMonitorDeviceIdFromServer({
                  serverMonitorDeviceId: mj.config?.monitorDeviceId,
                  geofenceMonitorDeviceId: gj.config?.monitorDeviceId,
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
                });
                if (!fix) {
                  setResetError(
                    "No recent GPS for the monitoring device. Open SeaLink on that handset with location sharing until a fix appears, then try again.",
                  );
                  return;
                }
                if (!ANCHOR_LIVE_APIS_BLOCKED) {
                  try {
                    await fetch("/api/anchor/alerts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ seenId }),
                      credentials: "same-origin",
                    });
                    await fetch("/api/anchor/geofence", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "same-origin",
                      body: JSON.stringify({
                        lat: fix.lat,
                        lng: fix.lng,
                        lastAlertAt: null,
                        lastBearingDeg: null,
                      }),
                    });
                  } catch {
                    setResetError("Could not save the new anchor. Check your connection and try again.");
                    return;
                  }
                }
                clearPresentedAnchorAlertId();
                setAlert(null);
              } finally {
                setResetBusy(false);
              }
            })();
          }}
          className="h-14 w-full rounded-xl bg-emerald-500 text-base font-bold text-white shadow-lg hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
        >
          {resetBusy ? "Loading monitor position…" : "Reset at monitor position"}
        </button>
        <Link
          href="/anchor-alarm"
          className="inline-flex h-14 w-full items-center justify-center rounded-xl border-2 border-white/80 bg-white/10 px-4 text-base font-bold text-white hover:bg-white/20 sm:max-w-xs"
        >
          Open map &amp; anchor
        </Link>
        <button
          type="button"
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
          className="h-14 w-full rounded-xl border-2 border-white bg-white/95 text-base font-bold text-red-700 shadow-lg hover:bg-white sm:max-w-xs"
        >
          Mark seen (stop alarm)
        </button>
      </div>
      <p className="bg-black/40 px-4 py-2 text-center text-[11px] text-white/75">
        Leave SeaLink signed in on this device (even in the background) so it can pick up alerts from your monitoring phone.
        <span className="mt-1 block opacity-90">
          <strong className="text-white/90">Reset at monitor position</strong> keeps the same radius and moves the orange
          ring to the <strong className="text-white/90">monitoring device’s</strong> latest GPS (from the server), then
          clears this alert.
        </span>
      </p>
    </div>
  );
}
