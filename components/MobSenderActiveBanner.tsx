"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getBoatName, getFullName, getProfilePhone } from "@/lib/map-profile-storage";
import { getMobPosition } from "@/lib/map-mob-position";
import { isBareMetaDataDeletionPage } from "@/lib/messaging-chrome-paths";

const STORAGE_KEY = "sealink_mob_sender_active_until";
const EVENT = "sealink-mob-sent";
const CLEARED_EVENT = "sealink-mob-sender-cleared";

function readUntil(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function MobSenderActiveBanner() {
  const [active, setActive] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sync = useCallback(() => {
    const until = readUntil();
    if (until > 0 && until <= Date.now()) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* */
      }
      setActive(false);
      return;
    }
    setActive(until > Date.now());
  }, []);

  useEffect(() => {
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) sync();
    };
    const onSent = () => sync();
    const onCleared = () => sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT, onSent);
    window.addEventListener(CLEARED_EVENT, onCleared);
    const id = window.setInterval(sync, 1000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT, onSent);
      window.removeEventListener(CLEARED_EVENT, onCleared);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [sync]);

  const clearSenderState = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event(CLEARED_EVENT));
    } catch {
      /* */
    }
    setActive(false);
  }, []);

  const sendCancel = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const { lat, lng } = await getMobPosition();
      const r = await fetch("/api/map/mob/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat,
          lng,
          fullName: getFullName(),
          boatName: getBoatName(),
          phone: getProfilePhone(),
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error || "Could not send cancellation");
        return;
      }
      clearSenderState();
      setConfirmOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send cancellation");
    } finally {
      setBusy(false);
    }
  }, [clearSenderState]);

  if (isBareMetaDataDeletionPage(pathname)) return null;
  if (!active) return null;

  return (
    <>
      <div
        className="fixed right-0 left-0 z-[45] border-b border-red-900/70 bg-zinc-950/95 shadow-[0_4px_24px_rgba(0,0,0,0.45)]"
        style={{ top: "calc(2.75rem + env(safe-area-inset-top, 0px))" }}
        role="region"
        aria-label="Man overboard sender controls"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4">
          <div
            className="sealink-mob-sender-bar size-2.5 shrink-0 rounded-full bg-red-600 sm:size-3"
            aria-hidden
          />
          <p className="min-w-0 flex-1 text-[11px] leading-snug font-semibold text-red-100 sm:text-sm">
            MOB alert active on this device — cancel when the emergency is over to notify nearby boaters.
          </p>
          <button
            type="button"
            onClick={() => {
              setErr(null);
              setConfirmOpen(true);
            }}
            className="shrink-0 rounded-lg border border-red-800/80 bg-red-950/80 px-2.5 py-2 text-[11px] font-bold tracking-wide text-red-100 hover:bg-red-900/80 sm:px-3 sm:text-xs"
          >
            Cancel broadcast
          </button>
        </div>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-[1350] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/65"
            aria-label="Close"
            onClick={() => !busy && setConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mob-cancel-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-xl"
          >
            <h2 id="mob-cancel-title" className="text-lg font-semibold text-zinc-50">
              Cancel MOB broadcast?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              This sends a <strong className="text-zinc-200">wide-area message</strong> (same ~10 mile reach as the
              alert) stating the emergency is over — person secure — with your position and contact details again.
            </p>
            {err ? (
              <p className="mt-3 rounded-lg border border-red-900/50 bg-red-950/50 px-3 py-2 text-sm text-red-200">
                {err}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
                className="h-11 rounded-xl border border-zinc-600 px-4 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendCancel()}
                className="h-11 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Yes, send cancellation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export {
  STORAGE_KEY as MOB_SENDER_ACTIVE_UNTIL_KEY,
  EVENT as MOB_SENDER_SENT_EVENT,
  CLEARED_EVENT as MOB_SENDER_CLEARED_EVENT,
};
