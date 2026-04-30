"use client";

import { useEffect, useState } from "react";

type Alert = { basin: string; title: string; summary: string; link: string };

export function StormAlertStrip() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const r = await fetch("/api/weather/nhc", { cache: "no-store" });
        const d = (await r.json()) as { alerts?: Alert[] };
        if (disposed) return;
        setAlerts(Array.isArray(d.alerts) ? d.alerts : []);
      } catch {
        if (!disposed) setAlerts([]);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 10 * 60_000);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, []);

  if (!alerts.length) return null;
  const a = alerts[0]!;
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Tropical cyclone alert ({a.basin})</p>
          <p className="mt-1 text-xs leading-5 opacity-90">
            <span className="font-semibold">{a.title}</span> — {a.summary}
          </p>
        </div>
        <a
          href={a.link}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800"
        >
          More info
        </a>
      </div>
    </div>
  );
}

