import type { Metadata } from "next";
import { HomeLocationMapLoader } from "@/components/home/HomeLocationMapLoader";

export const metadata: Metadata = {
  title: "Local Map",
  description: "Local map with GPS on SeaLink",
};

export default function LocalMapPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Local map</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Same map as home: GPS, your boat name and photo on the pin, with background-friendly updates on by default
          while the tab stays open (pause from the map if you prefer).
        </p>
        <HomeLocationMapLoader />
      </main>
    </div>
  );
}
