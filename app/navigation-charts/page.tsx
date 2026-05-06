import type { Metadata } from "next";
import { NavigationChartsClient } from "@/components/navigation-charts/NavigationChartsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Navigation Charts",
  description: "Marine navigation charts workspace — KAP/BSB and OpenCPN integration coming soon.",
};

export default function NavigationChartsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pb-8 sm:pt-8">
        <NavigationChartsClient />
      </main>
    </div>
  );
}
