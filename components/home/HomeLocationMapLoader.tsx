"use client";

/** Loads `HomeLocationMap` only — no `/api/map/presence` calls here. */

import dynamic from "next/dynamic";

const HomeLocationMap = dynamic(() => import("./HomeLocationMap"), {
  ssr: false,
  loading: () => (
    <div
      className="mt-8 h-[min(55vh,420px)] min-h-[280px] w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800"
      aria-hidden
    />
  ),
});

export function HomeLocationMapLoader({
  signedIn = false,
  sharingUiMode = "home",
  anchorPlacement = "full",
  showHomeMapExtras = true,
}: {
  signedIn?: boolean;
  sharingUiMode?: "home" | "settings";
  /** `full`: anchor button + modal on this map. `compact`: status pill only (manage on /anchor-alarm). */
  anchorPlacement?: "full" | "compact";
  /** When false: omit weather strip, messages CTA, and Life on Seas modal (e.g. dedicated anchor page). */
  showHomeMapExtras?: boolean;
}) {
  return (
    <HomeLocationMap
      signedIn={signedIn}
      sharingUiMode={sharingUiMode}
      anchorPlacement={anchorPlacement}
      showHomeMapExtras={showHomeMapExtras}
    />
  );
}
