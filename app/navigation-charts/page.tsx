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
        <NavigationChartsClient />
        <div className="mt-5 sm:mt-6">
          <Link
            href="/colregs"
            className="group block rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow md:p-5 dark:border-emerald-900/40 dark:from-emerald-950/25 dark:via-zinc-950 dark:to-emerald-950/25"
            aria-label="Open COLREGs: The International Regulations for Preventing Collisions at Sea"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-black tracking-tight text-emerald-900 sm:text-3xl dark:text-emerald-200">
                    COLREGs
                  </div>
                  <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white shadow-sm">
                    TAP TO OPEN
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium leading-snug text-zinc-700 sm:text-base dark:text-zinc-300">
                  The International Regulations for Preventing Collisions at Sea
                </div>
                <div className="mt-2 text-xs font-semibold text-emerald-800/90 dark:text-emerald-200/90">
                  Quick rules summary + link to full PDF
                </div>
              </div>
              <div
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition group-hover:translate-x-0.5 group-hover:bg-emerald-500"
              >
                <span className="text-xl leading-none">→</span>
              </div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
