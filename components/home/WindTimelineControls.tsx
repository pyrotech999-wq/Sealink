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

export function WindTimelineControls({ slots, index, onPrev, onNext, loading }: Props) {
  if (loading) {
    return (
      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Loading 3-hour wind timeline…</p>
      </div>
    );
  }

  if (!slots.length) {
    return (
      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">No hourly wind data for this location.</p>
      </div>
    );
  }

  const slot = slots[Math.min(Math.max(index, 0), slots.length - 1)]!;
  const kn = mphToKnots(slot.mph);
  const from = windFromCompass16(slot.dirFromDeg);
  const fromNum = Math.round(((slot.dirFromDeg % 360) + 360) % 360);

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
