"use client";

import { useEffect, useMemo, useState } from "react";

type StyleId = "colour" | "bw";

type InfoOk = { ok: true; style: StyleId; issueTimeIso: string | null; leads: number[] };

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function formatDt(s: string): string {
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return s;
  return d.toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
}

export function MetOfficeUkMedEuropePressureBox() {
  const [style, setStyle] = useState<StyleId>("colour");
  const [lead, setLead] = useState(0);
  const [info, setInfo] = useState<InfoOk | null>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ style });
        const r = await fetch(`/api/weather/metoffice-surface-pressure/info?${qs.toString()}`, { cache: "no-store" });
        const j = (await r.json()) as InfoOk | { ok?: false };
        if (!r.ok || !("ok" in j) || !j.ok) return;
        if (!disposed) setInfo(j as InfoOk);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      disposed = true;
    };
  }, [style]);

  const leads = info?.leads?.length ? info.leads : [0, 12, 24, 36, 48, 60, 72, 84];
  const leadIdx = Math.max(0, leads.indexOf(lead));
  const effectiveLead = leadIdx >= 0 ? lead : leads[0] ?? 0;

  useEffect(() => {
    if (!leads.includes(lead)) setLead(effectiveLead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, info?.leads?.join(",")]);

  const src = useMemo(() => {
    const qs = new URLSearchParams({ style, lead: String(effectiveLead) });
    return `/api/weather/metoffice-surface-pressure?${qs.toString()}`;
  }, [style, effectiveLead]);

  const issue = info?.issueTimeIso ?? null;
  const valid = useMemo(() => {
    if (!issue) return null;
    const t = new Date(issue).getTime();
    if (!Number.isFinite(t)) return null;
    return new Date(t + effectiveLead * 60 * 60 * 1000).toISOString();
  }, [issue, effectiveLead]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">UK, Med &amp; Europe</h2>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            Official Met Office surface pressure charts (analysis + forecasts). Cached server-side for 6 hours.
          </p>
          {issue && valid ? (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Issue: <span className="font-mono">{formatDt(issue)}</span> · Valid:{" "}
              <span className="font-mono">{formatDt(valid)}</span>
            </p>
          ) : null}
        </div>
        <a
          className="self-start rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          href="https://www.metoffice.gov.uk/weather/maps-and-charts/surface-pressure"
          target="_blank"
          rel="noreferrer"
        >
          Met Office
        </a>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <button
            type="button"
            onClick={() => setStyle("colour")}
            className={`h-9 px-3 text-xs font-semibold ${
              style === "colour"
                ? "bg-emerald-600 text-white"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            Colour
          </button>
          <button
            type="button"
            onClick={() => setStyle("bw")}
            className={`h-9 px-3 text-xs font-semibold ${
              style === "bw"
                ? "bg-emerald-600 text-white"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            B/W
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Step <span className="font-mono text-zinc-900 dark:text-zinc-100">+{effectiveLead}h</span>
          </div>
          <button
            type="button"
            onClick={() => setLead(leads[clamp(leadIdx - 1, 0, leads.length - 1)] ?? 0)}
            disabled={leadIdx <= 0}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setLead(leads[clamp(leadIdx + 1, 0, leads.length - 1)] ?? 0)}
            disabled={leadIdx >= leads.length - 1}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Next
          </button>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0, leads.length - 1)}
        step={1}
        value={Math.max(0, leads.indexOf(effectiveLead))}
        onChange={(e) => setLead(leads[Number(e.target.value)] ?? 0)}
        className="mt-3 w-full"
        aria-label="Surface pressure lead time"
      />

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="border-b border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Surface pressure</span>
          <span className="text-zinc-500 dark:text-zinc-400"> · </span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">{style}</span>
          <span className="text-zinc-500 dark:text-zinc-400"> · </span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">+{effectiveLead}h</span>
        </div>
        <div className="flex items-center justify-center p-2 sm:p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className="h-auto w-full max-w-[980px] rounded-xl bg-white shadow-sm dark:bg-zinc-950"
          />
        </div>
      </div>
    </section>
  );
}

