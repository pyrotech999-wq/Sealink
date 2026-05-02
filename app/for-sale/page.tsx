import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For sale",
  description: "Boats for sale and boat gear listings on SeaLink.",
};

export default function ForSalePage() {
  return (
    <div className="flex flex-1 flex-col bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/" className="text-sm font-medium text-green-800 hover:underline dark:text-green-400">
          ← Home
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          For sale
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Choose <strong className="text-zinc-800 dark:text-zinc-200">boats for sale</strong> (paid listings) or{" "}
          <strong className="text-zinc-800 dark:text-zinc-200">boat gear</strong> (buy and sell kit and spares).
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link
            href="/vessels"
            className="group flex min-h-[10rem] flex-col justify-between rounded-2xl border-2 border-emerald-800/50 bg-gradient-to-br from-emerald-950/80 to-zinc-950 p-6 shadow-lg transition hover:border-emerald-500/70 hover:from-emerald-900/90 sm:min-h-[11rem]"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400/90">Listings</p>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-zinc-50 sm:text-2xl">Boats for sale</h2>
              <p className="mt-2 text-sm leading-snug text-zinc-400">
                Paid boat adverts — post, renew, and browse by category.
              </p>
            </div>
            <span className="mt-4 text-sm font-semibold text-emerald-300 group-hover:underline">Open →</span>
          </Link>

          <Link
            href="/gear"
            className="group flex min-h-[10rem] flex-col justify-between rounded-2xl border-2 border-sky-800/50 bg-gradient-to-br from-sky-950/80 to-zinc-950 p-6 shadow-lg transition hover:border-sky-500/70 hover:from-sky-900/90 sm:min-h-[11rem]"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-400/90">Marketplace</p>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-zinc-50 sm:text-2xl">Boat gear</h2>
              <p className="mt-2 text-sm leading-snug text-zinc-400">
                Chandlery, kit, and spares — not whole boats.
              </p>
            </div>
            <span className="mt-4 text-sm font-semibold text-sky-300 group-hover:underline">Open →</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
