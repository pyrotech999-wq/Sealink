"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapBroadcastPanel } from "@/components/home/MapBroadcastPanel";
import { DEFAULT_MAP_CENTER } from "@/lib/map-constants";
import { getLastKnownPosition } from "@/lib/map-last-known";
import { setMessagingLastVisitNow } from "@/lib/messaging-last-visit";
import { getShareOnMap } from "@/lib/map-profile-storage";

type Props = {
  signedIn: boolean;
  canSendGlobalBroadcast: boolean;
};

export function MessagingBroadcastClient({ signedIn, canSendGlobalBroadcast }: Props) {
  const searchParams = useSearchParams();
  const openPeer = searchParams.get("open")?.trim() || null;

  const [sharing, setSharing] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setMessagingLastVisitNow();
  }, []);

  useEffect(() => {
    const sync = () => {
      setSharing(getShareOnMap());
      setTick((n) => n + 1);
    };
    sync();
    const id = window.setInterval(sync, 1500);
    window.addEventListener("storage", sync);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const last = typeof window !== "undefined" ? getLastKnownPosition() : null;
  const readLat = last?.lat ?? DEFAULT_MAP_CENTER.lat;
  const readLng = last?.lng ?? DEFAULT_MAP_CENTER.lng;
  const canSend = Boolean(sharing && last);
  const sendLat = canSend ? last!.lat : null;
  const sendLng = canSend ? last!.lng : null;

  return (
    <MapBroadcastPanel
      signedIn={signedIn}
      canSendGlobalBroadcast={canSendGlobalBroadcast}
      readLat={readLat}
      readLng={readLng}
      canSend={canSend}
      sendLat={sendLat}
      sendLng={sendLng}
      layout="messaging"
      initialOpenPeerUid={openPeer}
    />
  );
}
