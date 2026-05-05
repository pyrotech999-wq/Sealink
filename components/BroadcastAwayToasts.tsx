"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useBroadcastToast } from "@/components/BroadcastToastProvider";
import { getLastKnownPosition } from "@/lib/map-last-known";
import { suppressMessagingChromePath } from "@/lib/messaging-chrome-paths";
import { getDemoMe } from "@/lib/client/demo-me";
import { subscribeMapLive } from "@/lib/client/map-live-store";

const WATERLINE_KEY = "sealink_broadcast_toast_waterline_v1";

function readWaterline(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(WATERLINE_KEY);
  } catch {
    return null;
  }
}

function writeWaterline(iso: string): void {
  try {
    sessionStorage.setItem(WATERLINE_KEY, iso);
  } catch {
    /* */
  }
}

type Msg = { id: string; body: string; createdAt: string; isMine: boolean; isMob?: boolean };

/** When not on the home map, poll using last-known GPS (if fresh) and surface new area broadcasts as toasts. */
export function BroadcastAwayToasts() {
  const pathname = usePathname();
  const toast = useBroadcastToast();

  useEffect(() => {
    if (!toast) return;
    if (
      pathname === "/" ||
      pathname === "" ||
      pathname === "/messaging" ||
      suppressMessagingChromePath(pathname)
    ) {
      return;
    }

    let cancelled = false;
    let signedIn = false;
    void getDemoMe()
      .then((d) => {
        signedIn = d.signedIn === true;
      })
      .catch(() => {
        signedIn = false;
      });

    const unsub = subscribeMapLive({
      id: "BroadcastAwayToasts",
      getCoords: () => {
        const geo = getLastKnownPosition();
        return geo ? { lat: geo.lat, lng: geo.lng } : null;
      },
      onData: (d) => {
        if (cancelled || !signedIn) return;
        try {
          const msgs = Array.isArray(d.messages) ? (d.messages as Msg[]) : [];
          const newest = msgs[0]?.createdAt;
          if (!newest) return;

          const wl = readWaterline();
          if (wl == null) {
            writeWaterline(newest);
            return;
          }

          for (const m of msgs) {
            if (new Date(m.createdAt) <= new Date(wl)) break;
            if (m.isMob) continue;
            if (!m.isMine) toast.pushToast(m.body, "broadcast", { id: m.id });
          }
          writeWaterline(newest);
        } catch {
          /* ignore */
        }
      },
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [pathname, toast]);

  return null;
}
