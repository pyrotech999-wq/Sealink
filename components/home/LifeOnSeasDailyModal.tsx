"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** True when the user has live GPS on the map (pin visible). */
  pinLive: boolean;
  lat: number | null;
  lng: number | null;
};

type ApiOk = {
  text: string;
  source?: string;
  model?: string;
  place?: string | null;
  detail?: string;
};
type ApiErr = { error: string };

export function LifeOnSeasDailyModal({ open, onClose, pinLive, lat, lng }: Props) {
  const titleId = useId();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const openedRef = useRef(false);
  const prevOpen = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !prevOpen.current) {
      setMessage(null);
      setErr(null);
      openedRef.current = false;
    }
    prevOpen.current = open;
  }, [open]);

  const fetchLine = useCallback(async () => {
    setMessage(null);
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/life-on-seas-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pinLive,
          lat: pinLive && lat != null ? lat : null,
          lng: pinLive && lng != null ? lng : null,
          seed: Date.now() + Math.floor(Math.random() * 9999),
        }),
      });
      const data = (await res.json()) as ApiOk | ApiErr;
      if (!res.ok) {
        const fail = data as ApiErr;
        setErr(fail.error || "Could not load message");
        return;
      }
      const ok = data as ApiOk;
      if (!ok.text?.trim()) {
        setErr("Empty response");
        return;
      }
      setMessage(ok.text.trim());
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  }, [pinLive, lat, lng]);

  useEffect(() => {
    if (!open || openedRef.current) return;
    openedRef.current = true;
    void fetchLine();
  }, [open, fetchLine]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current;
    el.scrollTop = el.scrollHeight;
  }, [message, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/45 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[min(85vh,540px)] w-full max-w-md overflow-hidden rounded-2xl border border-teal-200/80 bg-gradient-to-b from-teal-50 to-white shadow-2xl dark:border-teal-900/50 dark:from-teal-950/90 dark:to-zinc-950"
      >
        <div className="border-b border-teal-200/60 px-5 py-4 dark:border-teal-900/40">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-teal-950 dark:text-teal-50">
            Sea&apos;s the day!
          </h2>
          <p className="mt-1 text-xs leading-5 text-teal-900/75 dark:text-teal-200/80">On the water reflections!</p>
        </div>

        <div ref={listRef} className="max-h-[min(52vh,320px)] space-y-3 overflow-y-auto px-5 py-4">
          {message ? (
            <p className="text-sm leading-6 text-zinc-800 dark:text-zinc-200">{message}</p>
          ) : !err ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{loading ? "Setting course…" : "…"}</p>
          ) : null}
          {err ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {err}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-teal-200/60 bg-white/90 px-5 py-4 dark:border-teal-900/40 dark:bg-zinc-950/90">
          <button
            type="button"
            disabled={loading}
            onClick={() => void fetchLine()}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            {loading ? "Fetching…" : "Another Sea's the day!"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 text-sm font-medium text-teal-900 underline-offset-2 hover:underline dark:text-teal-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
