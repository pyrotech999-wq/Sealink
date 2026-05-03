import type { Metadata } from "next";
import { BroadcastChatPageClient } from "./BroadcastChatPageClient";

export const metadata: Metadata = {
  title: "Broadcast chat",
  description: "Replies to an area broadcast you can see.",
};

export default function BroadcastChatPage({ params }: { params: { broadcastId: string } }) {
  return <BroadcastChatPageClient broadcastId={params.broadcastId} />;
}
