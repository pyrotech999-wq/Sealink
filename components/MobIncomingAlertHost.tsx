"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLastKnownPosition } from "@/lib/map-last-known";
import { startMobSiren, stopMobSiren } from "@/lib/mob-siren";

const WATERLINE_KEY = "sealink_mob_incoming_waterline_v1";
const DISMISSED_KEY = "sealink_mob_dismissed_ids_v1";
const POLL_MS = 20_000;
const GEO_MAX_AGE_MS = 2 * 60 * 60 * 1000;

type ApiMsg = {
  id: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  isMob?: boolean;
  mobPhone?: string | null;
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
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<ApiMsg | null>(null);
  const [sessionOk, setSessionOk] = useState(false);
  const dismissedRef = useRef(readDismissed());

  const silence = useCallback((id: string) => {
    stopMobSiren();
    dismissedRef.current.add(id);
    writeDismissed(dismissedRef.current);
    setOpen(false);
    setMsg(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/gear/session");
        if (cancelled) return;
        setSessionOk(r.ok);
      } catch {
        if (!cancelled) setSessionOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open || !msg) return;
    startMobSiren();
    return () => {
      stopMobSiren();
    };
  }, [open, msg]);

  useEffect(() => {
    if (!sessionOk) return;

    const tick = () => {
      const geo = getLastKnownPosition(GEO_MAX_AGE_MS);
      if (!geo) return;

      void (async () => {
        try {
          const r = await fetch(
            `/api/map/broadcast?lat=${encodeURIComponent(String(geo.lat))}&lng=${encodeURIComponent(String(geo.lng))}`,
          );
          const d = (await r.json()) as { messages?: ApiMsg[] };
          if (!r.ok) return;
          const messages = Array.isArray(d.messages) ? d.messages : [];
          const newest = messages[0]?.createdAt;
          if (!newest) return;

          const wl = readWaterline();
          if (wl == null) {
            writeWaterline(newest);
            return;
          }

          const dismissed = dismissedRef.current;
          for (const m of messages) {
            if (new Date(m.createdAt) <= new Date(wl)) break;
            if (!m.isMob || m.isMine || dismissed.has(m.id)) continue;
            setMsg(m);
            setOpen(true);
            break;
          }
          writeWaterline(newest);
        } catch {
          /* ignore */
        }
      })();
    };

    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [sessionOk]);

  if (!open || !msg) return null;

  const phone = typeof msg.mobPhone === "string" ? msg.mobPhone.trim() : "";
  const callHref = phone ? telHref(phone) : "";

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
        <pre className="mt-4 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-zinc-800 bg-black/40 p-3 text-sm text-zinc-100">
          {msg.body}
        </pre>
        <p className="mt-3 text-xs text-zinc-500">
          Alarm runs up to five minutes. Use Silence to stop sound on this device (others are unchanged).
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
