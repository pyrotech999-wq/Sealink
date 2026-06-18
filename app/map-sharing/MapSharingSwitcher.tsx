"use client";

import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import { HomeHeader } from "@/components/HomeHeader";
import { HomeLocationMapLoader } from "@/components/home/HomeLocationMapLoader";
import { SeaLinkBrandFooter } from "@/components/SeaLinkBrandFooter";
import MobileMapSharingClient from "./MobileMapSharingClient";

export default function MapSharingSwitcher({
  signedIn,
  isAdmin,
}: {
  signedIn: boolean;
  isAdmin: boolean;
}) {
  const { isMobile, mounted } = useIsMobileApp();

  if (!mounted) {
    // Standard desktop loader/skeleton before hydration
    return (
      <div className="flex flex-1 flex-col bg-black min-h-screen">
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-8 sm:px-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-sm h-96 animate-pulse" />
        </main>
      </div>
    );
  }

  if (isMobile) {
    return <MobileMapSharingClient signedIn={signedIn} isAdmin={isAdmin} />;
  }

  // Exact default web UI unchanged
  return (
    <div className="flex flex-1 flex-col bg-black">
      <HomeHeader signedIn={signedIn} isAdmin={isAdmin} />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Map sharing</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Set your pin details and the three sharing options, then use the green or grey button to turn GPS sharing on
          or off. The live map is on the home page.
        </p>

        <HomeLocationMapLoader signedIn={signedIn} isAdmin={isAdmin} sharingUiMode="settings" />

        <SeaLinkBrandFooter />
      </main>
    </div>
  );
}
