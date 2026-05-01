"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  lat: number | null;
  lng: number | null;
};

type ApiSuccess = { configured: true; text: string; model?: string; openAi?: boolean };
type ApiFail = { error: string; detail?: string };

type GenerateOpts = { signal?: AbortSignal };

export function AiForecast48hBox({ lat, lng }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const gridLat = useMemo(
    () => (lat != null ? Number(lat.toFixed(2)) : null),
    [lat],
  );
  const gridLng = useMemo(
    () => (lng != null ? Number(lng.toFixed(2)) : null),
    [lng],
  );
  const hasLocation = gridLat != null && gridLng != null;

  const generate = useCallback(
    async (opts?: GenerateOpts) => {
      if (gridLat == null || gridLng == null) return;
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/forecast/ai-48h", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: gridLat, lng: gridLng }),
          signal: opts?.signal,
        });
        const data = (await res.json()) as ApiSuccess | ApiFail;
        if (!res.ok) {
          const fail = data as ApiFail;
          setErr(fail.detail ? `${fail.error}: ${fail.detail}` : fail.error);
          return;
        }
        const ok = data as ApiSuccess;
        if (ok.configured === true && ok.text) {
          setText(ok.text);
          return;
        }
        setErr("Unexpected response");
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (e instanceof Error && e.name === "AbortError") return;
        setErr("Network error");
      } finally {
        setLoading(false);
      }
    },
    [gridLat, gridLng],
  );

  useEffect(() => {
    if (!hasLocation) {
      setText(null);
      setErr(null);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    void generate({ signal: ac.signal });
    return () => ac.abort();
  }, [hasLocation, gridLat, gridLng, generate]);

  if (!hasLocation) {
    return (
      <div className="mt-8 w-full border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Show location for personalised forecast.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 w-full border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <div className="mb-3">
        <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">48-hour outlook</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Open-Meteo hourly data for your position, summarised for the next two days.
        </p>
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-4 shadow-sm dark:border-violet-900/50 dark:bg-violet-950/30">
        {loading && !text ? (
          <p className="text-sm text-violet-950/90 dark:text-violet-100/90">Loading forecast…</p>
        ) : loading && text ? (
          <p className="text-xs text-violet-800/80 dark:text-violet-200/80">Refreshing…</p>
        ) : null}

        {err && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </p>
        )}

        {text && (
          <div className="rounded-lg border border-violet-200/80 bg-white/90 px-4 py-3 text-sm leading-7 text-zinc-800 dark:border-violet-800/60 dark:bg-zinc-950/80 dark:text-zinc-200">
            {text
              .split(/\n\n+/)
              .filter(Boolean)
              .map((para, i) => (
                <p key={i} className={i > 0 ? "mt-3" : ""}>
                  {para}
                </p>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
