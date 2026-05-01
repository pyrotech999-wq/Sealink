"use client";

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
  canSendGlobalBroadcast = false,
}: {
  signedIn?: boolean;
  canSendGlobalBroadcast?: boolean;
}) {
  return <HomeLocationMap signedIn={signedIn} canSendGlobalBroadcast={canSendGlobalBroadcast} />;
}
