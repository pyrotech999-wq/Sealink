"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBroadcastAlertsSilenced, getMessageAlertSoundOn } from "@/lib/broadcast-alert-preferences";
import { playVicinityDmAlertSound } from "@/lib/broadcast-alert-sound";
import {
  getMessagingLastVisitIso,
  MESSAGING_LAST_VISIT_STORAGE_KEY,
  setMessagingLastVisitIso,
} from "@/lib/messaging-last-visit";

type BroadcastRow = {
  id: string;
  createdAt: string;
  isMine: boolean;
  isMob?: boolean;
};

type InboxRow = {
  threadId: string;
  peerUid: string;
  lastMessageId: string;
  lastAt: string;
  lastIsMine: boolean;
};

const POLL_MS = 45_000;

function maxIso(a: string | undefined, b: string | undefined): string | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

type Props = {
  signedIn: boolean;
  readLat: number;
  readLng: number;
};

export function HomeMessagesCtaButton({ signedIn, readLat, readLng }: Props) {
  const [hasNew, setHasNew] = useState(false);
  /** Peer to deep-link when the “new” state is from an incoming private message (not broadcast-only). */
  const [openPeerUid, setOpenPeerUid] = useState<string | null>(null);
  const lastDmChimeAtMs = useRef(0);

  const check = useCallback(async () => {
    const visit = getMessagingLastVisitIso();
    let broadcasts: BroadcastRow[] = [];
    try {
      const r = await fetch(
        `/api/map/broadcast?lat=${encodeURIComponent(String(readLat))}&lng=${encodeURIComponent(String(readLng))}`,
        { cache: "no-store" },
      );
      const d = (await r.json()) as { messages?: BroadcastRow[] };
      broadcasts = Array.isArray(d.messages) ? d.messages : [];
    } catch {
      return;
    }

    let inbox: InboxRow[] = [];
    if (signedIn) {
      try {
        const r2 = await fetch("/api/vicinity-chat/inbox", { cache: "no-store" });
        const d2 = (await r2.json()) as { threads?: InboxRow[] };
        inbox = Array.isArray(d2.threads) ? d2.threads : [];
      } catch {
        /* ignore inbox */
      }
    }

    const newestB = broadcasts[0]?.createdAt;
    const newestI = inbox[0]?.lastAt;
    const baseline = maxIso(newestB, newestI) ?? new Date().toISOString();

    if (!visit) {
      setMessagingLastVisitIso(baseline);
      queueMicrotask(() => {
        setHasNew(false);
        setOpenPeerUid(null);
      });
      return;
    }

    const v = new Date(visit).getTime();
    let newFromBroadcast = false;
    for (const m of broadcasts) {
      if (m.isMine) continue;
      if (new Date(m.createdAt).getTime() > v) {
        newFromBroadcast = true;
        break;
      }
    }

    let newestIncomingDmAt = 0;
    let newestIncomingDmPeer: string | null = null;
    if (signedIn) {
      for (const row of inbox) {
        if (row.lastIsMine) continue;
        const t = new Date(row.lastAt).getTime();
        if (t > v && t >= newestIncomingDmAt) {
          newestIncomingDmAt = t;
          newestIncomingDmPeer = row.peerUid;
        }
      }
    }

    const newFromDm = newestIncomingDmAt > 0;
    const newFlag = newFromBroadcast || newFromDm;

    if (
      newFromDm &&
      newestIncomingDmAt > lastDmChimeAtMs.current &&
      !getBroadcastAlertsSilenced() &&
      getMessageAlertSoundOn()
    ) {
      try {
        playVicinityDmAlertSound();
      } catch {
        /* */
      }
      lastDmChimeAtMs.current = newestIncomingDmAt;
    }

    queueMicrotask(() => {
      setHasNew(newFlag);
      setOpenPeerUid(newFromDm && newestIncomingDmPeer ? newestIncomingDmPeer : null);
    });
  }, [readLat, readLng, signedIn]);

  useEffect(() => {
    queueMicrotask(() => void check());
    const id = window.setInterval(() => queueMicrotask(() => void check()), POLL_MS);
    return () => window.clearInterval(id);
  }, [check]);

  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === null || ev.key === MESSAGING_LAST_VISIT_STORAGE_KEY) {
        queueMicrotask(() => void check());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [check]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") queueMicrotask(() => void check());
    };
    window.addEventListener("pageshow", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pageshow", onVis);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [check]);

  const href =
    hasNew && openPeerUid
      ? `/messaging?open=${encodeURIComponent(openPeerUid)}`
      : "/messaging";

  return (
    <div className="mt-6">
      <Link
        href={href}
        className={`flex min-h-[4rem] w-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-4 py-3 text-center font-bold tracking-tight shadow-lg transition-colors sm:min-h-[4.25rem] sm:py-4 ${
          hasNew
            ? "border-green-600 bg-green-600 text-white hover:bg-green-500 dark:border-green-500 dark:bg-green-600 dark:hover:bg-green-500"
            : "border-sky-500 bg-sky-600 text-white hover:bg-sky-500 dark:border-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500"
        }`}
        aria-live="polite"
      >
        {hasNew ? (
          <>
            <span className="text-lg sm:text-xl">New messages</span>
            <span className="text-base font-semibold leading-tight opacity-95 sm:text-lg">Click here</span>
          </>
        ) : (
          <span className="text-lg sm:text-xl">No new messages</span>
        )}
      </Link>
    </div>
  );
}
