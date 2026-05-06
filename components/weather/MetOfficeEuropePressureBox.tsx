"use client";

import { useMemo, useState } from "react";

type StyleId = "colour" | "bw";

const LEADS = Array.from({ length: 8 }, (_, i) => i * 12); // 0..84 by 12

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function MetOfficeEuropePressureBox() {
  const [style, setStyle] = useState<StyleId>("colour");
  const [lead, setLead] = useState(0);

  const src = useMemo(() => {
    const qs = new URLSearchParams({ style, lead: String(lead) });
    return `/api/weather/metoffice-surface-pressure?${qs.toString()}`;
  }, [style, lead]);

  const leadIdx = Math.max(0, LEADS.indexOf(lead));

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Europe surface pressure (Met Office)
          </h2>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            Colour or black &amp; white, stepped in 12-hour increments. Cached for 6 hours.
          </p>
        </div>
        <a
          className="self-start rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          href="https://www.metoffice.gov.uk/weather/maps-and-charts/surface-pressure"
          target="_blank"
          rel="noreferrer"
        >
          Met Office site
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
            Step <span className="font-mono text-zinc-900 dark:text-zinc-100">+{lead}h</span>
          </div>
          <button
            type="button"
            onClick={() => setLead((h) => clamp(h - 12, 0, 84))}
            disabled={lead <= 0}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setLead((h) => clamp(h + 12, 0, 84))}
            disabled={lead >= 84}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Next
          </button>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0, LEADS.length - 1)}
        step={1}
        value={leadIdx}
        onChange={(e) => setLead(LEADS[Number(e.target.value)] ?? 0)}
        className="mt-3 w-full"
        aria-label="Surface pressure lead time"
      />

      <div className="mt-2 flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
        <span className="font-mono">+0h</span>
        <span className="font-mono">+{LEADS[Math.floor(LEADS.length / 2)]}h</span>
        <span className="font-mono">+84h</span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="border-b border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Europe &amp; NE Atlantic</span>
          <span className="text-zinc-500 dark:text-zinc-400"> · </span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">{style === "colour" ? "colour" : "b/w"}</span>
          <span className="text-zinc-500 dark:text-zinc-400"> · </span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">+{lead}h</span>
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

