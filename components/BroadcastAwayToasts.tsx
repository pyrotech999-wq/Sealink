"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useBroadcastToast } from "@/components/BroadcastToastProvider";
import { getLastKnownPosition } from "@/lib/map-last-known";

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

type Msg = { id: string; body: string; createdAt: string; isMine: boolean };

/** When not on the home map, poll using last-known GPS (if fresh) and surface new area broadcasts as toasts. */
export function BroadcastAwayToasts() {
  const pathname = usePathname();
  const toast = useBroadcastToast();

  useEffect(() => {
    if (!toast) return;
    if (pathname === "/" || pathname === "") return;

    const tick = () => {
      const geo = getLastKnownPosition();
      if (!geo) return;
      void (async () => {
        try {
          const r = await fetch(
            `/api/map/broadcast?lat=${encodeURIComponent(String(geo.lat))}&lng=${encodeURIComponent(String(geo.lng))}`,
          );
          const d = (await r.json()) as { messages?: Msg[] };
          const msgs = Array.isArray(d.messages) ? d.messages : [];
          const newest = msgs[0]?.createdAt;
          if (!newest) return;

          const wl = readWaterline();
          if (wl == null) {
            writeWaterline(newest);
            return;
          }

          for (const m of msgs) {
            if (new Date(m.createdAt) <= new Date(wl)) break;
            if (!m.isMine) toast.pushToast(m.body, "broadcast", { id: m.id });
          }
          writeWaterline(newest);
        } catch {
          /* ignore */
        }
      })();
    };

    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [pathname, toast]);

  return null;
}
