import type { Metadata } from "next";
import { LocalPresenceClientWrapper } from "@/components/local/LocalPresenceClientWrapper";

export const metadata: Metadata = {
  title: "Local map",
  description: "Nearby users map on SeaLink",
};

export default function LocalMapPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-y-auto px-4 py-8 sm:px-6 sm:py-10">
        <LocalPresenceClientWrapper />
      </main>
    </div>
  );
}
