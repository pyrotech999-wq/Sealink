"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getLastKnownPosition } from "@/lib/map-last-known";
import { startMobSiren, stopMobSiren } from "@/lib/mob-siren";
import { MOB_CANCEL_BROADCAST_INTRO } from "@/lib/map-broadcast-constants";
import { LinkifiedPlainText } from "@/components/LinkifiedPlainText";
import { mapHrefPreferCoords } from "@/lib/map-links";
import { hideBroadcastId, readHiddenBroadcastIds } from "@/lib/broadcast-hidden";
import { isBareMetaDataDeletionPage } from "@/lib/messaging-chrome-paths";
import { subscribeMapLive } from "@/lib/client/map-live-store";

const WATERLINE_KEY = "sealink_mob_incoming_waterline_v1";
const DISMISSED_KEY = "sealink_mob_dismissed_ids_v1";
const GEO_MAX_AGE_MS = 2 * 60 * 60 * 1000;

type ApiMsg = {
  id: string;
  authorUid: string;
  lat: number;
  lng: number;
  body: string;
  createdAt: string;
  isMine: boolean;
  isMob?: boolean;
  isGlobal?: boolean;
  mobPhone?: string | null;
  canAdminDelete?: boolean;
};

function readWaterline(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(WATERLINE_KEY);
  } catch {
    return null;
  }
}

function writeWaterline(iso: string): void {
  try {
    sessionStorage.setItem(WATERLINE_KEY, iso);
  } catch {
    /* */
  }
}

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return new Set();
    return new Set(p.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeDismissed(s: Set<string>): void {
  try {
    const arr = [...s].slice(-80);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(arr));
  } catch {
    /* */
  }
}

function telHref(phone: string): string {
  const t = phone.trim();
  if (!t) return "";
  if (t.startsWith("+")) return `tel:${t}`;
  return `tel:${t}`;
}

export function MobIncomingAlertHost() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<ApiMsg | null>(null);
  const [deleting, setDeleting] = useState(false);
  const dismissedRef = useRef(readDismissed());
  const msgRef = useRef<ApiMsg | null>(null);
  const openRef = useRef(false);

  useEffect(() => {
    msgRef.current = msg;
    openRef.current = open;
  }, [msg, open]);

  const silence = useCallback((id: string) => {
    stopMobSiren();
    dismissedRef.current.add(id);
    writeDismissed(dismissedRef.current);
    setOpen(false);
    setMsg(null);
  }, []);

  const hideMobOnDevice = useCallback(() => {
    const cur = msgRef.current;
    if (!cur) return;
    hideBroadcastId(cur.id);
    silence(cur.id);
  }, [silence]);

  const deleteMobFromFeed = useCallback(async () => {
    const cur = msgRef.current;
    if (!cur?.canAdminDelete) return;
    if (
      !window.confirm(
        "Remove this MOB alert for everyone on the site? (Admin only — other devices keep it until they hide it or you remove it.)",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const r = await fetch("/api/map/live", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cur.id }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        window.alert(d.error || "Could not delete");
        return;
      }
      silence(cur.id);
    } catch {
      window.alert("Network error");
    } finally {
      setDeleting(false);
    }
  }, [silence]);

  useEffect(() => {
    if (!open || !msg) return;
    startMobSiren();
    return () => {
      stopMobSiren();
    };
  }, [open, msg]);

  useEffect(() => {
    const unsub = subscribeMapLive({
      id: "MobIncomingAlertHost",
      getCoords: () => {
        const geo = getLastKnownPosition(GEO_MAX_AGE_MS);
        return geo ? { lat: geo.lat, lng: geo.lng } : null;
      },
      onData: (d) => {
        try {
          const messages = Array.isArray(d.messages) ? (d.messages as ApiMsg[]) : [];
          const newest = messages[0]?.createdAt;
          if (!newest) return;

          const wl = readWaterline();
          if (wl == null) {
            writeWaterline(newest);
            return;
          }

          const dismissed = dismissedRef.current;
          const cur = msgRef.current;
          const openNow = openRef.current;
          if (cur && openNow) {
            const off = messages.find(
              (m) =>
                !m.isMob &&
                !m.isMine &&
                m.authorUid === cur.authorUid &&
                new Date(m.createdAt) > new Date(cur.createdAt) &&
                m.body.startsWith(MOB_CANCEL_BROADCAST_INTRO),
            );
            if (off) silence(cur.id);
          }

          const hidden = readHiddenBroadcastIds();
          for (const m of messages) {
            if (new Date(m.createdAt) <= new Date(wl)) break;
            if (!m.isMob || m.isMine || dismissed.has(m.id) || hidden.has(m.id)) continue;
            setMsg(m);
            setOpen(true);
            break;
          }
          writeWaterline(newest);
        } catch {
          /* ignore */
        }
      },
    });

    return unsub;
  }, [silence]);

  if (isBareMetaDataDeletionPage(pathname)) return null;
  if (!open || !msg) return null;

  const phone = typeof msg.mobPhone === "string" ? msg.mobPhone.trim() : "";
  const callHref = phone ? telHref(phone) : "";
  const mapHref = mapHrefPreferCoords(msg.body, msg.lat, msg.lng);

  return (
    <div className="fixed inset-0 z-[1400] flex items-end justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Background"
        onClick={() => silence(msg.id)}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mob-incoming-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-red-700/60 bg-zinc-950 p-5 shadow-2xl shadow-red-950/40"
      >
        <h2 id="mob-incoming-title" className="text-xl font-bold tracking-tight text-red-200">
          Man overboard nearby
        </h2>
        <p className="mt-1 text-xs font-medium text-red-300/90">Emergency broadcast from a vessel in your area</p>
        <div className="mt-4 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-zinc-800 bg-black/40 p-3 text-sm text-zinc-100">
          <LinkifiedPlainText text={msg.body} />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Alarm runs up to five minutes. Silence stops sound here only. Hide removes this alert from your list on this
          device; others still see it unless they hide it or an admin removes it from the server.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {mapHref ? (
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-sky-600 text-center text-sm font-bold text-white hover:bg-sky-500"
            >
              Open sender position on map
            </a>
          ) : null}
          {callHref ? (
            <a
              href={callHref}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-emerald-600 text-center text-sm font-bold text-white hover:bg-emerald-500"
            >
              Call sender
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => silence(msg.id)}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-zinc-600 text-sm font-semibold text-zinc-200 hover:bg-zinc-900"
          >
            Silence alarm
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Hide this MOB alert on this device only?")) hideMobOnDevice();
            }}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-zinc-500 bg-zinc-900 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 sm:w-auto sm:flex-1"
          >
            Hide on this device
          </button>
          {msg.canAdminDelete ? (
            <button
              type="button"
              disabled={deleting}
              onClick={() => void deleteMobFromFeed()}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-red-700/80 bg-red-950/50 text-sm font-semibold text-red-200 hover:bg-red-950 disabled:opacity-50 sm:w-auto sm:flex-1"
            >
              {deleting ? "Removing…" : "Admin: remove for everyone"}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => startMobSiren()}
          className="mt-2 w-full text-center text-xs text-zinc-500 underline decoration-zinc-600 hover:text-zinc-300"
        >
          Replay alarm sound
        </button>
      </div>
    </div>
  );
}
