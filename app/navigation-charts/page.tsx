import type { Metadata } from "next";
import Link from "next/link";
import { NavigationChartsClient } from "@/components/navigation-charts/NavigationChartsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Navigation Charts",
  description:
    "Upload and preview your own KAP/BSB raster charts — parse header, decode raster, and view on a map with georeference bounds.",
};

export default function NavigationChartsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pb-8 sm:pt-8">
        <div className="mb-5 sm:mb-6">
          <Link
            href="/colregs"
            className="block rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow md:p-5 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/60"
            aria-label="Open COLREGs: The International Regulations for Preventing Collisions at Sea"
          >
            <div className="text-center">
              <div className="text-2xl font-black tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
                COLREGs
              </div>
              <div className="mt-1 text-sm font-medium leading-snug text-zinc-600 sm:text-base dark:text-zinc-300">
                The International Regulations for Preventing Collisions at Sea
              </div>
            </div>
          </Link>
        </div>
        <NavigationChartsClient />
      </main>
    </div>
  );
}
