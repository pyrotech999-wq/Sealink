"use client";

import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import { GearMarketplace } from "./GearMarketplace";
import Link from "next/link";

export default function GearSwitcher() {
  const { isMobile, mounted } = useIsMobileApp();

  if (!mounted) {
    return (
      <div className="flex flex-1 flex-col bg-black min-h-screen">
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-8 sm:px-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-sm h-96 animate-pulse" />
        </main>
      </div>
    );
  }

  if (isMobile) {
    return <GearMarketplace />;
  }

  // Desktop view (original app/gear/page.tsx layout)
  return (
    <div className="flex flex-1 flex-col bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/for-sale" className="text-sm font-medium text-green-800 hover:underline dark:text-green-400">
          ← Buy & Sell
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Boat gear — buy &amp; sell
        </h1>
        <div className="mt-4 flex">
          <a
            href="#post-gear"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700"
          >
            Post your item
          </a>
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Member listings for chandlery, kit, and spares. Search by title or description, filter by category, and manage
          your own posts — sold items drop off the board; everything else expires on a rolling schedule unless you
          extend.
        </p>
        <div className="mt-8">
          <GearMarketplace />
        </div>
      </main>
    </div>
  );
}
