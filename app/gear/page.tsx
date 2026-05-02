import Link from "next/link";
import type { Metadata } from "next";
import { GearMarketplace } from "./GearMarketplace";

export const metadata: Metadata = {
  title: "Boat gear — buy & sell",
  description: "Buy and sell boat equipment, spares, and kit on SeaLink — not boats.",
};

export default function GearPage() {
  return (
    <div className="flex flex-1 flex-col bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/for-sale" className="text-sm font-medium text-green-800 hover:underline dark:text-green-400">
          ← For sale
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Boat gear — buy &amp; sell
        </h1>
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
