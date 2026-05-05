"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getLastKnownPosition } from "@/lib/map-last-known";
import { suppressMessagingChromePath } from "@/lib/messaging-chrome-paths";
import { getDemoMe } from "@/lib/client/demo-me";
import { subscribeMapLive } from "@/lib/client/map-live-store";

type Alert = {
  broadcastId: string;
  authorUid: string;
  lastMessageId: string;
  lastMessageAt: string;
  snippet: string;
};

function dispatchUnread(ids: string[]): void {
  try {
    window.dispatchEvent(new CustomEvent("sealink-broadcast-reply-unread-ids", { detail: { ids } }));
  } catch {
    /* */
  }
}

export function BroadcastReplyAlertsHost() {
  const pathname = usePathname();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    void getDemoMe()
      .then((d) => setSignedIn(Boolean(d.signedIn)))
      .catch(() => setSignedIn(false));
  }, [pathname]);

  useEffect(() => {
    if (!signedIn) {
      setAlerts([]);
      dispatchUnread([]);
      return;
    }
    return subscribeMapLive({
      id: "BroadcastReplyAlertsHost",
      getCoords: () => {
        const geo = getLastKnownPosition();
        return geo ? { lat: geo.lat, lng: geo.lng } : null;
      },
      onData: (d) => {
        const list = Array.isArray(d.replyAlerts) ? (d.replyAlerts as Alert[]) : [];
        setAlerts(list);
        dispatchUnread(list.map((a) => a.broadcastId));
        setIndex((i) => (list.length === 0 ? 0 : Math.min(i, list.length - 1)));
      },
    });
  }, [signedIn, pathname]);

  if (!signedIn || suppressMessagingChromePath(pathname) || alerts.length === 0) return null;

  const cur = alerts[index] ?? alerts[0];
  if (!cur) return null;

  const openChat = () => {
    const geo = getLastKnownPosition();
    if (!geo) return;
    const u = new URL(`/messaging/broadcast/${encodeURIComponent(cur.broadcastId)}`, window.location.origin);
    u.searchParams.set("lat", String(geo.lat));
    u.searchParams.set("lng", String(geo.lng));
    router.push(`${u.pathname}${u.search}`);
  };

  return (
    <div
      className="sticky z-[35] border-b border-emerald-800/60 bg-zinc-950/95 px-2 py-2 shadow-lg backdrop-blur-sm sm:px-4"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 3.35rem)" }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2">
        {alerts.length > 1 ? (
          <div className="flex items-center justify-center gap-2 text-xs font-medium text-zinc-300">
            <button
              type="button"
              onClick={() => setIndex((i) => (i <= 0 ? alerts.length - 1 : i - 1))}
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1 text-zinc-100 hover:bg-zinc-700"
            >
              Previous
            </button>
            <span className="tabular-nums text-zinc-400">
              {index + 1} / {alerts.length}
            </span>
            <button
              type="button"
              onClick={() => setIndex((i) => (i >= alerts.length - 1 ? 0 : i + 1))}
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1 text-zinc-100 hover:bg-zinc-700"
            >
              Next
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void openChat()}
          className="flex min-h-14 w-full flex-col items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 px-4 py-3 text-center shadow-md ring-2 ring-emerald-400/40 transition hover:from-emerald-500 hover:to-green-500 active:scale-[0.99]"
        >
          <span className="text-base font-bold tracking-tight text-white sm:text-lg">New message received</span>
          {cur.snippet ? (
            <span className="mt-1 line-clamp-2 max-w-2xl text-xs font-medium text-emerald-50/95 sm:text-sm">{cur.snippet}</span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
