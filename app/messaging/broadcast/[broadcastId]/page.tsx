import type { Metadata } from "next";
import { Suspense } from "react";
import { BroadcastChatPageClient } from "./BroadcastChatPageClient";

export const metadata: Metadata = {
  title: "Broadcast chat",
  description: "Replies to an area broadcast you can see.",
};

export default function BroadcastChatPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-center text-zinc-500">Loading…</p>}>
      <BroadcastChatPageClient />
    </Suspense>
  );
}
