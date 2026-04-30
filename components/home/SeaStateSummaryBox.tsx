"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getLastKnownPosition } from "@/lib/map-last-known";

type ApiOk = {
  ok: true;
  text: string;
  snapshot?: { wave_height_m: number | null; sea_surface_temp_c: number | null };
  tide?: { events?: { kind: "high" | "low"; t: string; v: number }[] };
};
type ApiFail = { error: string };

export function SeaStateSummaryBox() {
  const [text, setText] = useState<string | null>(null);
  const [tides, setTides] = useState<{ kind: "high" | "low"; t: string; v: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loc = useMemo(() => (typeof window !== "undefined" ? getLastKnownPosition() : null), []);
  const hasLoc = Boolean(loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng));

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!loc) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/sea/local-summary?lat=${encodeURIComponent(String(loc.lat))}&lng=${encodeURIComponent(String(loc.lng))}`, {
        cache: "no-store",
        signal,
      });
      const d = (await r.json()) as ApiOk | ApiFail;
      if (!r.ok) {
        const f = d as ApiFail;
        setErr(f.error || "Could not load sea state");
        setText(null);
        return;
      }
      const ok = d as ApiOk;
      setText(ok.text);
      setTides(Array.isArray(ok.tide?.events) ? ok.tide!.events! : []);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof Error && e.name === "AbortError") return;
      setErr("Network error");
      setText(null);
      setTides([]);
    } finally {
      setLoading(false);
    }
  }, [loc]);

  useEffect(() => {
    if (!hasLoc) return;
    const ac = new AbortController();
    queueMicrotask(() => void load(ac.signal));
    return () => ac.abort();
  }, [hasLoc, load]);

  if (!hasLoc) {
    return (
      <div className="mt-8 w-full border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Sea state near you</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Open the map and allow location once to generate local sea conditions.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 w-full border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <div className="mb-3">
        <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Sea state near you</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Waves, water temperature, and modelled tides based on your last known map position.
        </p>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-4 shadow-sm dark:border-sky-900/50 dark:bg-sky-950/30">
        {loading && !text ? <p className="text-sm text-sky-950/90 dark:text-sky-100/90">Loading sea state…</p> : null}
        {err ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </p>
        ) : null}
        {text ? (
          <div className="rounded-lg border border-sky-200/80 bg-white/90 px-4 py-3 text-sm leading-7 text-zinc-800 dark:border-sky-800/60 dark:bg-zinc-950/80 dark:text-zinc-200">
            <p>{text}</p>
            {tides.length ? (
              <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 dark:border-sky-900/40 dark:bg-sky-950/20">
                <p className="text-xs font-semibold text-sky-950 dark:text-sky-100">Next tides (modelled)</p>
                <ul className="mt-1 space-y-1 text-xs text-zinc-700 dark:text-zinc-200">
                  {tides.slice(0, 4).map((e) => (
                    <li key={`${e.kind}:${e.t}`}>
                      <span className={`font-semibold ${e.kind === "high" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                        {e.kind === "high" ? "High" : "Low"}
                      </span>{" "}
                      {new Date(e.t).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })} ·{" "}
                      {e.v.toFixed(2)}m
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

