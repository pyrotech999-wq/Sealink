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
        <Link
          href="/payment"
          className="mt-6 inline-flex h-11 max-w-xs items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-medium text-white hover:bg-green-700"
        >
          Plans & payment
        </Link>
      </main>
    </div>
  );
}
