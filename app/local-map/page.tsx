import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Local Map",
  description: "Local map on SeaLink",
};

export default function LocalMapPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Local Map</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Placeholder for nearby / regional map view. Hook up geolocation and local tiles or pins here.
        </p>
      </main>
    </div>
  );
}
