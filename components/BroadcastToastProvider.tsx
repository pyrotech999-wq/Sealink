"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getBroadcastAlertsSilenced, getMessageAlertSoundOn } from "@/lib/broadcast-alert-preferences";
import { playBroadcastAlertSound, playVicinityDmAlertSound } from "@/lib/broadcast-alert-sound";
import { BOTTOM_DOCK_OFFSET } from "@/lib/bottom-dock-offset";
import {
  filterActiveAlerts,
  loadBroadcastAlerts,
  pruneBroadcastAlerts,
  saveBroadcastAlerts,
  type BroadcastAlertVariant,
  type PersistedBroadcastAlert,
} from "@/lib/broadcast-alert-inbox";

export type PushToastOpts = { id: string };

type Ctx = { pushToast: (text: string, variant?: BroadcastAlertVariant, opts?: PushToastOpts) => void };

const BroadcastToastCtx = createContext<Ctx | null>(null);

export function useBroadcastToast(): Ctx | null {
  return useContext(BroadcastToastCtx);
}

function makeKey(variant: BroadcastAlertVariant, id: string): string {
  return `${variant}:${id.trim()}`;
}

export function BroadcastToastProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<PersistedBroadcastAlert[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const next = loadBroadcastAlerts();
    setAlerts(next);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const t = window.setInterval(() => {
      setAlerts((prev) => {
        const pruned = pruneBroadcastAlerts(prev);
        if (pruned.length === prev.length) return prev;
        saveBroadcastAlerts(pruned);
        return pruned;
      });
    }, 5 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [hydrated]);

  const active = useMemo(() => filterActiveAlerts(alerts), [alerts]);

  useEffect(() => {
    setCurrentIndex((i) => {
      if (active.length === 0) return 0;
      return Math.min(i, active.length - 1);
    });
  }, [active.length]);

  const patchAlert = useCallback((key: string, patch: Partial<PersistedBroadcastAlert>) => {
    setAlerts((prev) => {
      const pruned = pruneBroadcastAlerts(prev);
      const next = pruned.map((a) => (a.key === key ? { ...a, ...patch } : a));
      saveBroadcastAlerts(next);
      return next;
    });
  }, []);

  const pushToast = useCallback((text: string, variant: BroadcastAlertVariant = "broadcast", opts?: PushToastOpts) => {
    const t = text.trim();
    if (!t) return;
    const rawId = opts?.id?.trim();
    const key = rawId
      ? makeKey(variant, rawId)
      : makeKey(variant, typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

    setAlerts((prev) => {
      let next = pruneBroadcastAlerts(prev);
      const existing = next.find((a) => a.key === key);
      if (existing?.deleted) return next;
      if (existing) return next;

      if (!getBroadcastAlertsSilenced() && getMessageAlertSoundOn()) {
        try {
          if (variant === "vicinity") playVicinityDmAlertSound();
          else playBroadcastAlertSound();
        } catch {
          /* */
        }
      }

      const entry: PersistedBroadcastAlert = {
        key,
        text: t,
        variant,
        receivedAt: Date.now(),
        seen: false,
        deleted: false,
      };
      next = [entry, ...next];
      next.sort((a, b) => b.receivedAt - a.receivedAt);
      saveBroadcastAlerts(next);
      return next;
    });
    setCurrentIndex(0);
  }, []);

  const current = active.length > 0 ? active[Math.min(currentIndex, active.length - 1)] : null;

  const onSeen = () => {
    if (!current) return;
    patchAlert(current.key, { seen: true });
    setCurrentIndex((i) => Math.min(i + 1, Math.max(0, active.length - 1)));
  };

  const onDelete = () => {
    if (!current) return;
    patchAlert(current.key, { deleted: true });
  };

  const goPrev = () => {
    setCurrentIndex((i) => Math.min(i + 1, Math.max(0, active.length - 1)));
  };

  const goNext = () => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  };

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <BroadcastToastCtx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-[95] flex flex-col items-center gap-2 px-3"
        style={{ bottom: `calc(${BOTTOM_DOCK_OFFSET} + env(safe-area-inset-bottom))` }}
        aria-live="polite"
      >
        {current ? (
          <div className="pointer-events-auto w-full max-w-md rounded-xl border border-indigo-200 bg-indigo-50/98 shadow-lg dark:border-indigo-900/60 dark:bg-indigo-950/95">
            <div className="px-4 pb-2 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                  {current.variant === "vicinity" ? "Vicinity message" : "Vicinity broadcast"}
                </p>
                {current.seen ? (
                  <span className="rounded bg-zinc-200/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                    Read
                  </span>
                ) : null}
              </div>
              <div className="mt-1 max-h-40 overflow-y-auto text-sm leading-snug text-indigo-950 dark:text-indigo-50">
                <p className="whitespace-pre-wrap">{current.text}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-indigo-200/70 px-3 py-2 dark:border-indigo-800/60">
              {active.length > 1 ? (
                <div className="flex items-center justify-between gap-2 text-[11px] text-indigo-800 dark:text-indigo-200">
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={currentIndex >= active.length - 1}
                    className="rounded-md border border-indigo-200 bg-white px-2 py-1 font-semibold disabled:opacity-40 dark:border-indigo-800 dark:bg-indigo-900/40"
                  >
                    ← Older
                  </button>
                  <span className="tabular-nums text-indigo-700/90 dark:text-indigo-300/90">
                    {currentIndex + 1} / {active.length}
                  </span>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={currentIndex <= 0}
                    className="rounded-md border border-indigo-200 bg-white px-2 py-1 font-semibold disabled:opacity-40 dark:border-indigo-800 dark:bg-indigo-900/40"
                  >
                    Newer →
                  </button>
                </div>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onSeen}
                  className="h-9 flex-1 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                  Seen
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="h-9 flex-1 rounded-lg border border-red-300 bg-red-50 text-xs font-semibold text-red-900 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-100 dark:hover:bg-red-950/70"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

    </BroadcastToastCtx.Provider>
  );
}

