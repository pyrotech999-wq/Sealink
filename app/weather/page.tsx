import type { Metadata } from "next";
import { WeatherMapClientWrapper } from "@/components/weather/WeatherMapClientWrapper";

export const metadata: Metadata = {
  title: "Weather & sea",
  description: "Weather & sea map with GPS on SeaLink",
};

export default function WeatherPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden px-4 py-6 sm:px-6 sm:py-8">
        <WeatherMapClientWrapper />
      </main>
    </div>
  );
}

