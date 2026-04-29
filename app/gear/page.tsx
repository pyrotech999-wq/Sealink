import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gear buys and sell",
  description: "Buy and sell gear on SeaLink",
};

export default function GearPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Gear buys and sell</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Listings, wanted posts, and gear exchange — connect this tab to your marketplace or feeds when you are ready.
        </p>
      </main>
    </div>
  );
}
