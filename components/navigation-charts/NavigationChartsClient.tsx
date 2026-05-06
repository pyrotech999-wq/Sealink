"use client";

/**
 * Navigation Charts — placeholder surface for future marine chart features.
 *
 * Planned capability areas (architecture placeholders):
 * - KAP/BSB chart ingestion and rendering
 * - GPS vessel positioning on chart canvas
 * - Offline chart caching (IndexedDB / Capacitor storage)
 * - Chart overlays (grids, waypoints, depth shading)
 * - Route plotting (lines, legs, ETAs)
 * - Weather overlays (wind, pressure) synced with /weather data where applicable
 */

import Link from "next/link";
import { useCallback, useRef } from "react";

// TODO: Parse KAP/BSB headers and tile bodies for web or native rendering pipeline.
// TODO: Georeference chart images (corner points / affine transform) for map alignment.
// TODO: OpenCPN — add external launch support (desktop deep links, mobile URL schemes, or export bundle instructions).
// TODO: Offline marine chart storage — quota, eviction, and sync strategy.
// TODO: Vessel tracking integration — bridge GPS/watchPosition with chart viewport.

export function NavigationChartsClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onUploadKapClick = useCallback(() => {
    // TODO: Wire to KAP parser pipeline; for now only surface file picker for UX testing.
    fileInputRef.current?.click();
  }, []);

  const onKapSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // TODO: Validate extension, queue parse job, show progress UI.
    e.target.value = "";
  }, []);

  const onOpenOpenCpnClick = useCallback(() => {
    // TODO: Launch OpenCPN via platform-specific handler or show install/deep-link instructions modal.
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/weather"
          className="inline-flex h-10 w-full shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:w-auto sm:justify-center"
        >
          ← Back to Weather
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          Navigation Charts
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Marine chart workspace — coming soon. Optimized for phone and tablet; future builds will support KAP/BSB charts,
          vessel position, and offline use.
        </p>
      </header>

      {/* Large chart viewer placeholder — replace with map/canvas when rendering pipeline exists */}
      <section
        className="flex min-h-[min(52dvh,420px)] flex-1 flex-col overflow-hidden rounded-2xl border border-dashed border-zinc-300 bg-zinc-100/80 dark:border-zinc-600 dark:bg-zinc-900/50"
        aria-label="Chart viewer placeholder"
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <p className="text-base font-medium text-zinc-700 dark:text-zinc-200">Marine navigation charts will appear here</p>
          <p className="max-w-md text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            This panel will host georeferenced raster charts, pan/zoom, and your vessel overlay.
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept=".kap,.KAP,.bsb,.BSB"
          className="hidden"
          tabIndex={-1}
          onChange={onKapSelected}
        />
        <button
          type="button"
          onClick={onUploadKapClick}
          aria-label="Upload KAP or BSB chart file"
          className="inline-flex h-11 min-h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:bg-emerald-700 sm:flex-1 sm:min-w-[160px]"
        >
          Upload KAP Chart
        </button>
        <button
          type="button"
          onClick={onOpenOpenCpnClick}
          className="inline-flex h-11 min-h-11 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:flex-1 sm:min-w-[160px]"
        >
          Open in OpenCPN
        </button>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white/60 p-4 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
        <p className="font-semibold text-zinc-800 dark:text-zinc-200">Roadmap (preview)</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>KAP/BSB chart support</li>
          <li>GPS vessel positioning</li>
          <li>Offline chart caching</li>
          <li>Chart overlays</li>
          <li>Route plotting</li>
          <li>Weather overlays</li>
        </ul>
      </section>
    </div>
  );
}
