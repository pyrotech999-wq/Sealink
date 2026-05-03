import type { Metadata } from "next";
import { BroadcastChatPageClient } from "./BroadcastChatPageClient";

export const metadata: Metadata = {
  title: "Broadcast chat",
  description: "Replies to an area broadcast you can see.",
};

type PageParams = { broadcastId: string };

/** `params` is a Promise in production (Next.js 15+); sync access yields undefined and broke the chat page. */
export default async function BroadcastChatPage({ params }: { params: Promise<PageParams> }) {
  const { broadcastId: raw } = await params;
  const broadcastId = typeof raw === "string" ? raw.trim() : "";
  if (!broadcastId) {
    return (
      <p className="mx-auto max-w-lg px-4 py-10 text-center text-red-300">
        This broadcast link is invalid. Open the thread again from the message alert or the map.
      </p>
    );
  }
  return <BroadcastChatPageClient broadcastId={broadcastId} />;
}
