"use client";

import type { HourlyWindSlot } from "@/lib/open-meteo-hourly";
import { mphToKnots } from "@/lib/wind-tiers";
import { windFromCompass16 } from "@/lib/wind-compass";

type Props = {
  slots: HourlyWindSlot[];
  index: number;
  onPrev: () => void;
  onNext: () => void;
  loading: boolean;
  className?: string;
};

function formatSlotTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function WindTimelineControls({ slots, index, onPrev, onNext, loading, className }: Props) {
  if (loading) {
    return (
      <div className={className || "mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60"}>
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 py-1">Loading wind timeline…</p>
      </div>
    );
  }

  if (!slots.length) {
    return (
      <div className={className || "mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60"}>
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 py-1">No wind data available.</p>
      </div>
    );
  }

  const slot = slots[Math.min(Math.max(index, 0), slots.length - 1)]!;
  const kn = mphToKnots(slot.mph);
  const from = windFromCompass16(slot.dirFromDeg);
  const fromNum = Math.round(((slot.dirFromDeg % 360) + 360) % 360);

  // Premium Mobile Floating Layout
  if (className) {
    return (
      <div className={`${className} flex items-center justify-between gap-2 py-2 px-3`}>
        {/* Previous Button */}
        <button
          type="button"
          onClick={onPrev}
          disabled={index <= 0}
          className="flex h-9 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] active:bg-white/[0.08] text-zinc-300 disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <span className="text-[14px]">◀</span>
          <span className="text-[9px] font-bold ml-0.5">3h</span>
        </button>

        {/* Forecast Text Details */}
        <div className="flex-1 text-center min-w-0">
          <p className="text-[11px] font-extrabold text-slate-100 tracking-wide truncate">
            {formatSlotTime(slot.at)}
          </p>
          <p className="text-[10px] text-zinc-400 mt-0.5 leading-none flex items-center justify-center gap-1 flex-wrap">
            <span className="font-extrabold text-cyan-400">{Math.round(kn)} kn</span>
            <span className="opacity-40">·</span>
            <span>{Math.round(slot.mph)} mph</span>
            <span className="opacity-40">·</span>
            <span className="font-semibold text-emerald-400 uppercase tracking-wider">{from}</span>
          </p>
        </div>

        {/* Next Button */}
        <button
          type="button"
          onClick={onNext}
          disabled={index >= slots.length - 1}
          className="flex h-9 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] active:bg-white/[0.08] text-zinc-300 disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <span className="text-[9px] font-bold mr-0.5">3h</span>
          <span className="text-[14px]">▶</span>
        </button>
      </div>
    );
  }

  // Default Website View
  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-4">
      <p className="text-center text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Forecast step (3-hour)
      </p>
      <div className="mt-2 flex justify-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          disabled={index <= 0}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          ◀ 3 h earlier
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={index >= slots.length - 1}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          3 h later ▶
        </button>
      </div>
      <div className="mt-2 text-center">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{formatSlotTime(slot.at)}</p>
        <p className="mt-1 text-xs leading-snug text-zinc-600 dark:text-zinc-400">
          <span className="font-bold text-zinc-800 dark:text-zinc-200">{Math.round(slot.mph)} mph</span>
          {" · "}
          <span className="font-bold text-zinc-800 dark:text-zinc-200">{Math.round(kn)} kn</span>
          {" · wind from "}
          <span className="font-semibold text-green-800 dark:text-green-300">
            {from} ({String(fromNum).padStart(3, "0")}°)
          </span>
        </p>
      </div>
    </div>
  );
}
