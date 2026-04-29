import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "IFM — International Friends Map",
  description: "International Friends Map on SeaLink",
};

export default function IfmPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">International Friends Map</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          IFM — placeholder for your worldwide friends layer. Wire this route to your map component and data source.
        </p>
      </main>
    </div>
  );
}
