"use client";

import { useMemo, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  sharing: boolean;
  hasFix: boolean;
  pos: { lat: number; lng: number } | null;
  config: { armed: boolean; lat: number | null; lng: number | null; radiusM: number };
  onUpdate: (next: { armed: boolean; lat: number | null; lng: number | null; radiusM: number }) => void;
};

export function AnchorAlertModal({ open, onClose, sharing, hasFix, pos, config, onUpdate }: Props) {
  const [radius, setRadius] = useState(String(config.radiusM));

  const canSet = sharing && hasFix && pos != null;
  const hasAnchor = config.lat != null && config.lng != null;

  const hint = useMemo(() => {
    if (!sharing) return "Turn on “Share my location on this map” first.";
    if (!hasFix) return "Waiting for a GPS fix…";
    return null;
  }, [sharing, hasFix]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Anchor alert</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
              Set an anchor point and we’ll warn if you drift outside the radius while the app is running.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        {hint ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            {hint}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Drift radius (metres)
            <input
              inputMode="numeric"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              placeholder="e.g. 60"
            />
            <span className="mt-1 block text-[11px] text-zinc-500">Min 20m, max 500m.</span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSet}
              onClick={() => {
                const n = Math.max(20, Math.min(500, Math.round(Number(radius) || config.radiusM)));
                onUpdate({ ...config, lat: pos!.lat, lng: pos!.lng, radiusM: n, armed: true });
              }}
              className="h-9 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Set anchor at current position
            </button>
            <button
              type="button"
              disabled={!hasAnchor}
              onClick={() => onUpdate({ ...config, armed: false })}
              className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Disarm
            </button>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">Status</p>
            <p className="mt-1">
              {config.armed && hasAnchor ? "Armed" : "Not armed"} · Radius {config.radiusM}m
            </p>
            {hasAnchor ? (
              <p className="mt-1 text-[11px] opacity-80">
                Anchor {config.lat!.toFixed(5)}, {config.lng!.toFixed(5)}
              </p>
            ) : (
              <p className="mt-1 text-[11px] opacity-80">No anchor set yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

