import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Other",
  description: "More on SeaLink",
};

export default function OtherPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Other</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Use this tab for settings, help, profile shortcuts, or anything that does not belong on Home or the maps.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href="/profile"
            className="inline-flex h-11 max-w-xs items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Edit profile
          </Link>
          <Link
            href="/payment"
            className="inline-flex h-11 max-w-xs items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-medium text-white hover:bg-green-700"
          >
            Plans & payment
          </Link>
        </div>
      </main>
    </div>
  );
}
