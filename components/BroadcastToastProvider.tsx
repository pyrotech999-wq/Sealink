"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastItem = { id: string; text: string };

type Ctx = { pushToast: (text: string) => void };

const BroadcastToastCtx = createContext<Ctx | null>(null);

export function useBroadcastToast(): Ctx | null {
  return useContext(BroadcastToastCtx);
}

export function BroadcastToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const pushToast = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    setItems((prev) => [...prev, { id, text: t }].slice(-4));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, 10_000);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <BroadcastToastCtx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[95] flex flex-col items-center gap-2 px-3 sm:bottom-[calc(5rem+env(safe-area-inset-bottom))]"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto max-w-md rounded-xl border border-indigo-200 bg-indigo-50/98 px-4 py-3 text-sm leading-snug text-indigo-950 shadow-lg dark:border-indigo-900/60 dark:bg-indigo-950/95 dark:text-indigo-50"
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
              Nearby broadcast
            </p>
            <p className="mt-1 whitespace-pre-wrap text-indigo-950 dark:text-indigo-50">{item.text}</p>
          </div>
        ))}
      </div>
    </BroadcastToastCtx.Provider>
  );
}
