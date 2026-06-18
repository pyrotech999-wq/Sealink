import type { Metadata } from "next";
import { WeatherMapClientWrapper } from "@/components/weather/WeatherMapClientWrapper";
import WeatherSwitcher from "@/components/mobile/weather/WeatherSwitcher";

/** Avoid stale HTML/chunks at the edge after weather UI changes. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Weather & sea",
  description: "GFS model charts rendered from Open-Meteo data (no embedded external chart sites).",
};

export default function WeatherPage() {
  return (
      <WeatherSwitcher>
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden px-4 py-6 sm:px-6 sm:py-8">
        <WeatherMapClientWrapper />
      </main>
    </div>
    </WeatherSwitcher>
  );
}

