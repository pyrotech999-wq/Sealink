"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBroadcastAlertsSilenced, getMessageAlertSoundOn } from "@/lib/broadcast-alert-preferences";
import { playBroadcastAlertSound } from "@/lib/broadcast-alert-sound";
import { subscribeMapLive, type MapLiveResponse } from "@/lib/client/map-live-store";
import { getMessagePollDelayMs } from "@/lib/message-poll-delays";
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
  /** When true: skip live-map polling and `/api/vicinity-chat/inbox` polling (see HomeLocationMap). */
  emergencyDisableLiveMapApis?: boolean;
};

export function HomeMessagesCtaButton({
  signedIn,
  readLat,
  readLng,
  emergencyDisableLiveMapApis = false,
}: Props) {
  const [hasNew, setHasNew] = useState(false);
  /** Peer to deep-link when the “new” state is from an incoming private message (not broadcast-only). */
  const [openPeerUid, setOpenPeerUid] = useState<string | null>(null);
  /** Unread area-broadcast thread replies (same ids as the top “New message received” bar). */
  const [broadcastReplyUnreadIds, setBroadcastReplyUnreadIds] = useState<string[]>([]);
  const lastBroadcastChimeAtMs = useRef(0);
  const lastDmChimeAtMs = useRef(0);
  const liveRef = useRef<MapLiveResponse | null>(null);
  const checkRef = useRef<() => Promise<void>>(async () => {});
  /** Ignore stale inbox/map-live combinations when overlapping `check()` runs resolve out of order. */
  const checkSerial = useRef(0);

  useEffect(() => {
    const fn = (ev: Event) => {
      const ce = ev as CustomEvent<{ ids?: string[] }>;
      const ids = ce.detail?.ids;
      setBroadcastReplyUnreadIds(Array.isArray(ids) ? ids.filter((x) => typeof x === "string" && x.trim()) : []);
      queueMicrotask(() => void checkRef.current());
    };
    window.addEventListener("sealink-broadcast-reply-unread-ids", fn);
    return () => window.removeEventListener("sealink-broadcast-reply-unread-ids", fn);
  }, []);

  useEffect(() => {
    if (!Number.isFinite(readLat) || !Number.isFinite(readLng)) {
      setBroadcastReplyUnreadIds([]);
      return;
    }
    if (!signedIn) setBroadcastReplyUnreadIds([]);

    return subscribeMapLive({
      id: "HomeMessagesCtaButton:alerts",
      getCoords: () => ({ lat: readLat, lng: readLng }),
      onData: (d) => {
        liveRef.current = d;
        if (signedIn) {
          const list = Array.isArray(d.replyAlerts) ? d.replyAlerts : [];
          setBroadcastReplyUnreadIds(
            list.map((a) => {
              const o = a as { broadcastId?: unknown };
              return typeof o.broadcastId === "string" ? o.broadcastId : "";
            }).filter(Boolean),
          );
        }
        queueMicrotask(() => void checkRef.current());
      },
    });
  }, [signedIn, readLat, readLng]);

  const check = useCallback(async () => {
    if (emergencyDisableLiveMapApis) return;
    const serial = ++checkSerial.current;
    const isLatest = () => serial === checkSerial.current;

    const visit = getMessagingLastVisitIso();
    const d = liveRef.current;
    const broadcasts = Array.isArray(d?.messages) ? (d!.messages as BroadcastRow[]) : [];
    if (!broadcasts.length && !signedIn) return;

    let inbox: InboxRow[] = [];
    if (signedIn) {
      try {
        const r2 = await fetch("/api/vicinity-chat/inbox", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const d2 = (await r2.json()) as { threads?: InboxRow[] };
        inbox = Array.isArray(d2.threads) ? d2.threads : [];
      } catch {
        /* ignore inbox */
      }
    }

    if (!isLatest()) return;

    const newestB = broadcasts[0]?.createdAt;
    const newestI = inbox[0]?.lastAt;
    const baseline = maxIso(newestB, newestI) ?? new Date().toISOString();

    if (!visit) {
      setMessagingLastVisitIso(baseline);
      if (!isLatest()) return;
      queueMicrotask(() => {
        if (!isLatest()) return;
        setHasNew(false);
        setOpenPeerUid(null);
      });
      return;
    }

    const v = new Date(visit).getTime();
    let newestIncomingBroadcastAt = 0;
    for (const m of broadcasts) {
      if (m.isMine) continue;
      const t = new Date(m.createdAt).getTime();
      if (t > v && t >= newestIncomingBroadcastAt) newestIncomingBroadcastAt = t;
    }
    const newFromBroadcast = newestIncomingBroadcastAt > 0;

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

    if (!isLatest()) return;

    /* Home has no MapBroadcastPanel — play the same voice here for area + private new items (Messaging page still toasts from panel). */
    if (!getBroadcastAlertsSilenced() && getMessageAlertSoundOn()) {
      const brNeed = newFromBroadcast && newestIncomingBroadcastAt > lastBroadcastChimeAtMs.current;
      const dmNeed = newFromDm && newestIncomingDmAt > lastDmChimeAtMs.current;
      if (brNeed || dmNeed) {
        try {
          playBroadcastAlertSound();
        } catch {
          /* */
        }
        if (brNeed) lastBroadcastChimeAtMs.current = newestIncomingBroadcastAt;
        if (dmNeed) lastDmChimeAtMs.current = newestIncomingDmAt;
      }
    }

    queueMicrotask(() => {
      if (!isLatest()) return;
      setHasNew(newFlag);
      setOpenPeerUid(newFromDm && newestIncomingDmPeer ? newestIncomingDmPeer : null);
    });
  }, [readLat, readLng, signedIn, emergencyDisableLiveMapApis]);

  checkRef.current = check;

  useEffect(() => {
    if (emergencyDisableLiveMapApis) return;
    // No polling here: the single map-live store drives updates.
    queueMicrotask(() => void check());
  }, [check, emergencyDisableLiveMapApis]);

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

  useEffect(() => {
    const onFocus = () => queueMicrotask(() => void checkRef.current());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  /** Backup poll so the CTA updates even if a map-live delivery is missed (same cadence as other message polls). */
  useEffect(() => {
    if (emergencyDisableLiveMapApis || !signedIn) return;
    let cancelled = false;
    let tid: number | null = null;
    const scheduleAfter = (ms: number) => {
      if (cancelled) return;
      tid = window.setTimeout(loop, ms);
    };
    const loop = () => {
      if (cancelled) return;
      void checkRef.current().finally(() => {
        if (cancelled) return;
        scheduleAfter(getMessagePollDelayMs());
      });
    };
    void checkRef.current().finally(() => {
      if (cancelled) return;
      scheduleAfter(getMessagePollDelayMs());
    });
    const onVis = () => {
      if (tid != null) {
        window.clearTimeout(tid);
        tid = null;
      }
      if (!cancelled) void checkRef.current().finally(() => !cancelled && scheduleAfter(getMessagePollDelayMs()));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (tid != null) window.clearTimeout(tid);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [signedIn, emergencyDisableLiveMapApis]);

  const firstReplyBroadcastId = broadcastReplyUnreadIds[0]?.trim() ?? "";
  const hasReplyAlerts = firstReplyBroadcastId.length > 0;
  const href = hasReplyAlerts
    ? `/messaging/broadcast/${encodeURIComponent(firstReplyBroadcastId)}?lat=${encodeURIComponent(String(readLat))}&lng=${encodeURIComponent(String(readLng))}`
    : hasNew && openPeerUid
      ? `/messaging?open=${encodeURIComponent(openPeerUid)}`
      : "/messaging";

  const showGreen = hasReplyAlerts || hasNew;

  return (
    <div className="mt-6">
      <Link
        href={href}
        className={`flex min-h-[4rem] w-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-4 py-3 text-center font-bold tracking-tight shadow-lg transition-colors sm:min-h-[4.25rem] sm:py-4 ${
          showGreen
            ? "border-green-600 bg-green-600 text-white hover:bg-green-500 dark:border-green-500 dark:bg-green-600 dark:hover:bg-green-500"
            : "border-sky-500 bg-sky-600 text-white hover:bg-sky-500 dark:border-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500"
        }`}
        aria-live="polite"
      >
        {hasReplyAlerts ? (
          <>
            <span className="text-lg sm:text-xl">New Replies received</span>
            <span className="text-base font-semibold leading-tight opacity-95 sm:text-lg">Open thread</span>
          </>
        ) : hasNew ? (
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
