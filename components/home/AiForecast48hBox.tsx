"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_MAP_CENTER } from "@/lib/map-constants";

type Props = {
  lat: number | null;
  lng: number | null;
};

type ApiSuccess = { configured: true; text: string; model?: string; openAi?: boolean };
type ApiFail = { error: string; detail?: string };

type GenerateOpts = { signal?: AbortSignal; persistAutoKey?: string };

export function AiForecast48hBox({ lat, lng }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const useLat = lat ?? DEFAULT_MAP_CENTER.lat;
  const useLng = lng ?? DEFAULT_MAP_CENTER.lng;
  const atPin = lat != null && lng != null;

  const generate = useCallback(async (opts?: GenerateOpts) => {
    setLoading(true);
    setErr(null);
    setText(null);
    setModel(null);
    try {
      const res = await fetch("/api/forecast/ai-48h", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: useLat, lng: useLng }),
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
        setModel(ok.model ?? null);
        if (opts?.persistAutoKey && typeof window !== "undefined") {
          try {
            sessionStorage.setItem(opts.persistAutoKey, "1");
          } catch {
            /* quota / private mode */
          }
        }
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
  }, [useLat, useLng]);

  useEffect(() => {
    const ac = new AbortController();
    const storageKey = `sealink_ai48_auto_${useLat.toFixed(3)}_${useLng.toFixed(3)}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(storageKey)) return;
    void generate({ signal: ac.signal, persistAutoKey: storageKey });
    return () => ac.abort();
  }, [useLat, useLng, generate]);

  return (
    <div className="mt-8 w-full border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            48-hour outlook
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Open-Meteo hourly data for your point, summarised for the next two days. Without{" "}
            <code className="rounded bg-white/60 px-1 py-0.5 text-[10px] dark:bg-zinc-900/80">OPENAI_API_KEY</code> you
            get a built-in heuristic read; with a key, an OpenAI model writes the narrative instead. The first outlook
            loads automatically once per map position (this session); use Regenerate for a fresh run (GPT calls use the
            API).
          </p>
        </div>
        <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
          {atPin ? "Your shared position" : "Map centre — share location for yours"}
        </p>
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-4 shadow-sm dark:border-violet-900/50 dark:bg-violet-950/30">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => void generate()}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            {loading ? "Generating…" : text ? "Regenerate outlook" : "Generate 48-hour outlook"}
          </button>
          {model ? (
            <span className="text-[11px] text-violet-900/80 dark:text-violet-200/90">Model: {model}</span>
          ) : null}
        </div>

        {err && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </p>
        )}

        {text && (
          <div className="mt-4 rounded-lg border border-violet-200/80 bg-white/90 px-4 py-3 text-sm leading-7 text-zinc-800 dark:border-violet-800/60 dark:bg-zinc-950/80 dark:text-zinc-200">
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
