import type { Metadata } from "next";
import { StormAlertStrip } from "@/components/weather/StormAlertStrip";
import { WeatherSeaClientWrapper } from "@/components/weather/WeatherSeaClientWrapper";

export const metadata: Metadata = {
  title: "Weather & sea",
  description: "Weather & sea map with GPS on SeaLink",
};

export default function LocalMapPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Weather &amp; sea</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Wind and wave overlays for anywhere in the world. Starts at your location (if you allow it) but you can pan
          and zoom to other regions freely.
        </p>

        <StormAlertStrip />
        <div className="mt-4">
          <WeatherSeaClientWrapper />
        </div>
      </main>
    </div>
  );
}
