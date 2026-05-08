"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBroadcastToast } from "@/components/BroadcastToastProvider";
import { VicinityChatDrawer } from "@/components/home/VicinityChatDrawer";
import { LinkifiedPlainText } from "@/components/LinkifiedPlainText";
import { mapHrefPreferCoords } from "@/lib/map-links";
import { MOB_CANCEL_BROADCAST_INTRO } from "@/lib/map-broadcast-constants";
import type { MapBroadcastAudience } from "@/lib/map-broadcast-store";
import { refreshMapLive, subscribeMapLive } from "@/lib/client/map-live-store";
import { getMessagePollDelayMs } from "@/lib/message-poll-delays";
import {
  BROADCAST_HIDDEN_EVENT,
  hideBroadcastId,
  readHiddenBroadcastIds,
} from "@/lib/broadcast-hidden";

const WATERLINE_KEY = "sealink_broadcast_toast_waterline_v1";
const SOUND_KEY = "sealink_broadcast_sound_v1";

function readSoundOn(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeSoundOn(on: boolean): void {
  try {
    if (on) localStorage.removeItem(SOUND_KEY);
    else localStorage.setItem(SOUND_KEY, "0");
  } catch {
    /* */
  }
}

async function beepOnce(): Promise<void> {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    o.stop(now + 0.21);
    window.setTimeout(() => void ctx.close().catch(() => undefined), 500);
  } catch {
    /* ignore */
  }
}

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

const VICINITY_ACK_KEY = "sealink_vicinity_inbox_ack_v1";
const VICINITY_BOOT_KEY = "sealink_vicinity_inbox_boot_v1";

function readVicinityAck(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(VICINITY_ACK_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    return p && typeof p === "object" ? (p as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeVicinityAck(m: Record<string, string>): void {
  try {
    sessionStorage.setItem(VICINITY_ACK_KEY, JSON.stringify(m));
  } catch {
    /* */
  }
}

type VicinityInboxRowApi = {
  threadId: string;
  peerUid: string;
  lastMessageId: string;
  lastBody: string;
  lastAt: string;
  lastIsMine: boolean;
};

type IfmFriendApiRow = {
  kind: "email" | "phone";
  value: string;
  addedAt: string;
  uid?: string | null;
};

type ProfileDisplay = { fullName: string | null; boatName: string | null };

export type BroadcastMsg = {
  id: string;
  authorUid: string;
  lat: number;
  lng: number;
  body: string;
  createdAt: string;
  isMine: boolean;
  canAdminDelete?: boolean;
  isGlobal?: boolean;
  isMob?: boolean;
  /** Who can see this broadcast (default everyone nearby). */
  audience?: MapBroadcastAudience;
};

type Props = {
  signedIn: boolean;
  canSendGlobalBroadcast?: boolean;
  readLat: number;
  readLng: number;
  canSend: boolean;
  sendLat: number | null;
  sendLng: number | null;
  /** `messaging`: slightly larger type for broadcast + inbox (Messaging page). */
  layout?: "map" | "messaging";
  /** From `/messaging?open=` — opens private chat once for that peer. */
  initialOpenPeerUid?: string | null;
};

export function MapBroadcastPanel({
  signedIn,
  canSendGlobalBroadcast = false,
  readLat,
  readLng,
  canSend,
  sendLat,
  sendLng,
  layout = "map",
  initialOpenPeerUid = null,
}: Props) {
  const router = useRouter();
  const L = layout === "messaging";
  const toast = useBroadcastToast();
  const [messages, setMessages] = useState<BroadcastMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(() => (typeof window !== "undefined" ? readSoundOn() : true));
  const [chatPeerUid, setChatPeerUid] = useState<string | null>(null);
  const [chatContext, setChatContext] = useState<string | undefined>(undefined);
  const [unreadBroadcastReplyIds, setUnreadBroadcastReplyIds] = useState<Set<string>>(() => new Set());
  const [broadcastAllAreas, setBroadcastAllAreas] = useState(false);
  const [broadcastAudience, setBroadcastAudience] = useState<MapBroadcastAudience>("all_nearby");
  const [inboxRows, setInboxRows] = useState<VicinityInboxRowApi[]>([]);
  const [ifmFriends, setIfmFriends] = useState<IfmFriendApiRow[]>([]);
  const [startChatPeerUid, setStartChatPeerUid] = useState<string>("");
  const [profileByUid, setProfileByUid] = useState<Record<string, ProfileDisplay>>({});
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [messagingTab, setMessagingTab] = useState<"direct" | "area">(() => (signedIn ? "direct" : "area"));
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() =>
    typeof window !== "undefined" ? readHiddenBroadcastIds() : new Set(),
  );

  const coordsRef = useRef({ readLat, readLng });
  const toastRef = useRef(toast);
  const soundOnRef = useRef(soundOn);

  useEffect(() => {
    coordsRef.current = { readLat, readLng };
  }, [readLat, readLng]);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    const uid = initialOpenPeerUid?.trim();
    if (!uid || !signedIn) return;
    setMessagingTab("direct");
    setChatPeerUid(uid);
    setChatContext("Conversation");
    queueMicrotask(() => {
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/messaging");
      }
    });
  }, [signedIn, initialOpenPeerUid]);

  useEffect(() => {
    if (!signedIn) setMessagingTab("area");
  }, [signedIn]);

  useEffect(() => {
    const fn = (ev: Event) => {
      const ce = ev as CustomEvent<{ ids?: string[] }>;
      const ids = ce.detail?.ids;
      setUnreadBroadcastReplyIds(new Set(Array.isArray(ids) ? ids : []));
    };
    window.addEventListener("sealink-broadcast-reply-unread-ids", fn);
    return () => window.removeEventListener("sealink-broadcast-reply-unread-ids", fn);
  }, []);

  const openBroadcastChat = useCallback(
    (m: BroadcastMsg) => {
      if (!signedIn) return;
      if (!Number.isFinite(readLat) || !Number.isFinite(readLng)) return;
      const u = new URL(`/messaging/broadcast/${encodeURIComponent(m.id)}`, window.location.origin);
      u.searchParams.set("lat", String(readLat));
      u.searchParams.set("lng", String(readLng));
      router.push(`${u.pathname}${u.search}`);
    },
    [signedIn, readLat, readLng, router],
  );

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const { readLat: lat, readLng: lng } = coordsRef.current;
    if (!silent) {
      setLoading(true);
      setErr(null);
    }
    try {
      const d = await refreshMapLive();
      const msgs = Array.isArray(d.messages) ? (d.messages as BroadcastMsg[]) : [];
      setMessages(msgs);
      if (silent) setErr(null);

      const unread = Array.isArray(d.replyAlerts) ? (d.replyAlerts as { broadcastId?: string }[]) : [];
      const ids = unread
        .map((a) => (typeof a.broadcastId === "string" ? a.broadcastId : ""))
        .filter(Boolean);
      try {
        window.dispatchEvent(new CustomEvent("sealink-broadcast-reply-unread-ids", { detail: { ids } }));
      } catch {
        /* */
      }

      const newest = msgs[0]?.createdAt;
      if (!newest) return;

      const wl = readWaterline();
      if (wl == null) {
        writeWaterline(newest);
        return;
      }

      let shouldBeep = false;
      const t = toastRef.current;
      if (t) {
        for (const m of msgs) {
          if (new Date(m.createdAt) <= new Date(wl)) break;
          if (m.isMob) continue;
          if (!m.isMine) t.pushToast(m.body, "broadcast", { id: m.id });
          if (!m.isMine) shouldBeep = true;
        }
      }
      if (shouldBeep && soundOnRef.current) void beepOnce();
      writeWaterline(newest);
    } catch {
      if (!silent) {
        setErr("Network error");
        setMessages([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const unsub = subscribeMapLive({
      id: "MapBroadcastPanel",
      getCoords: () => ({ lat: coordsRef.current.readLat, lng: coordsRef.current.readLng }),
      onData: (d) => {
        const msgs = Array.isArray(d.messages) ? (d.messages as BroadcastMsg[]) : [];
        setMessages(msgs);
        setErr(null);
        setLoading(false);

        const unread = Array.isArray(d.replyAlerts) ? (d.replyAlerts as { broadcastId?: string }[]) : [];
        const ids = unread
          .map((a) => (typeof a.broadcastId === "string" ? a.broadcastId : ""))
          .filter(Boolean);
        try {
          window.dispatchEvent(new CustomEvent("sealink-broadcast-reply-unread-ids", { detail: { ids } }));
        } catch {
          /* */
        }
      },
    });
    queueMicrotask(() => void load());
    return unsub;
  }, [load, signedIn]);

  const prevCoords = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    const prev = prevCoords.current;
    prevCoords.current = { lat: readLat, lng: readLng };
    if (!prev) return;
    if (prev.lat === readLat && prev.lng === readLng) return;
    queueMicrotask(() => void load({ silent: true }));
  }, [readLat, readLng, load]);

  const fetchInbox = useCallback(async () => {
    if (!signedIn) return;
    try {
      const r = await fetch("/api/vicinity-chat/inbox", { credentials: "same-origin", cache: "no-store" });
      const d = (await r.json()) as { threads?: VicinityInboxRowApi[]; error?: string };
      if (!r.ok) return;
      const rows = Array.isArray(d.threads) ? d.threads : [];
      setInboxRows(rows);

      const toastApi = toastRef.current;
      const ack = readVicinityAck();
      const booted = sessionStorage.getItem(VICINITY_BOOT_KEY) === "1";
      for (const row of rows) {
        if (ack[row.threadId] === row.lastMessageId) continue;
        if (booted && !row.lastIsMine && toastApi) {
          toastApi.pushToast(row.lastBody.slice(0, 280), "vicinity", {
            id: `${row.threadId}:${row.lastMessageId}`,
          });
        }
        ack[row.threadId] = row.lastMessageId;
      }
      if (!booted) sessionStorage.setItem(VICINITY_BOOT_KEY, "1");
      writeVicinityAck(ack);
    } catch {
      /* ignore */
    }
  }, [signedIn]);

  const fetchIfmFriends = useCallback(async () => {
    if (!signedIn) return;
    try {
      const r = await fetch("/api/ifm/friends", { credentials: "same-origin", cache: "no-store" });
      const d = (await r.json()) as { friends?: IfmFriendApiRow[] };
      if (!r.ok) return;
      const rows = Array.isArray(d.friends) ? d.friends : [];
      setIfmFriends(rows);
      if (!startChatPeerUid) {
        const firstUid = rows.find((f) => typeof f?.uid === "string" && f.uid.trim())?.uid?.trim() ?? "";
        if (firstUid) setStartChatPeerUid(firstUid);
      }
    } catch {
      /* ignore */
    }
  }, [signedIn, startChatPeerUid]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let tid: number | null = null;
    const scheduleAfter = (ms: number) => {
      if (cancelled) return;
      tid = window.setTimeout(loop, ms);
    };
    const loop = () => {
      if (cancelled) return;
      void fetchInbox().finally(() => {
        if (cancelled) return;
        scheduleAfter(getMessagePollDelayMs());
      });
    };
    void fetchInbox().finally(() => {
      if (cancelled) return;
      scheduleAfter(getMessagePollDelayMs());
    });
    const onVis = () => {
      if (tid != null) {
        window.clearTimeout(tid);
        tid = null;
      }
      if (!cancelled) void fetchInbox().finally(() => !cancelled && scheduleAfter(getMessagePollDelayMs()));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (tid != null) window.clearTimeout(tid);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [signedIn, fetchInbox]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let tid: number | null = null;
    const scheduleAfter = (ms: number) => {
      if (cancelled) return;
      tid = window.setTimeout(loop, ms);
    };
    const loop = () => {
      if (cancelled) return;
      void fetchIfmFriends().finally(() => {
        if (cancelled) return;
        scheduleAfter(getMessagePollDelayMs());
      });
    };
    void fetchIfmFriends().finally(() => {
      if (cancelled) return;
      scheduleAfter(getMessagePollDelayMs());
    });
    const onVis = () => {
      if (tid != null) {
        window.clearTimeout(tid);
        tid = null;
      }
      if (!cancelled) void fetchIfmFriends().finally(() => !cancelled && scheduleAfter(getMessagePollDelayMs()));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (tid != null) window.clearTimeout(tid);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [signedIn, fetchIfmFriends]);

  useEffect(() => {
    if (!signedIn || !L) return;
    const uids = new Set<string>();
    for (const row of inboxRows) {
      const u = typeof row.peerUid === "string" ? row.peerUid.trim() : "";
      if (u) uids.add(u);
    }
    for (const f of ifmFriends) {
      const u = typeof f.uid === "string" ? f.uid.trim() : "";
      if (u) uids.add(u);
    }
    const need = [...uids].filter((u) => !profileByUid[u]);
    if (need.length === 0) return;

    let cancelled = false;
    const ac = new AbortController();

    const run = async () => {
      for (const uid of need) {
        if (cancelled) return;
        try {
          const r = await fetch(`/api/profiles/display?uid=${encodeURIComponent(uid)}`, {
            credentials: "same-origin",
            cache: "no-store",
            signal: ac.signal,
          });
          const d = (await r.json()) as { fullName?: string | null; boatName?: string | null };
          if (!r.ok) continue;
          const fullName = typeof d.fullName === "string" && d.fullName.trim() ? d.fullName.trim() : null;
          const boatName = typeof d.boatName === "string" && d.boatName.trim() ? d.boatName.trim() : null;
          if (cancelled) return;
          setProfileByUid((prev) => (prev[uid] ? prev : { ...prev, [uid]: { fullName, boatName } }));
        } catch {
          /* ignore */
        }
      }
    };
    void run();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [signedIn, L, inboxRows, ifmFriends, profileByUid]);

  useEffect(() => {
    const sync = () => setHiddenIds(readHiddenBroadcastIds());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(BROADCAST_HIDDEN_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(BROADCAST_HIDDEN_EVENT, sync);
    };
  }, []);

  const onDeleteDmThread = async (row: VicinityInboxRowApi, ev: React.MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (
      !window.confirm(
        "Delete this entire conversation? All messages in the thread are removed for you and the other boater.",
      )
    ) {
      return;
    }
    setDeletingThreadId(row.threadId);
    setErr(null);
    try {
      const r = await fetch("/api/vicinity-chat/thread", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: row.threadId }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error || "Could not delete conversation");
        return;
      }
      if (chatPeerUid === row.peerUid) {
        setChatPeerUid(null);
        setChatContext(undefined);
      }
      await fetchInbox();
    } catch {
      setErr("Network error");
    } finally {
      setDeletingThreadId(null);
    }
  };

  const onSend = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!canSend || sendLat == null || sendLng == null) return;
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    setErr(null);
    try {
      const r = await fetch("/api/map/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: sendLat,
          lng: sendLng,
          text,
          ...(canSendGlobalBroadcast && broadcastAllAreas ? { broadcastAllAreas: true } : { audience: broadcastAudience }),
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error || "Could not send");
        return;
      }
      setDraft("");
      setBroadcastAllAreas(false);
      setBroadcastAudience("all_nearby");
      await load({ silent: true });
    } catch {
      setErr("Network error");
    } finally {
      setPosting(false);
    }
  };

  const onHideOnDevice = (id: string) => {
    hideBroadcastId(id);
    setHiddenIds(readHiddenBroadcastIds());
  };

  const onAdminDelete = async (m: BroadcastMsg) => {
    if (!m.canAdminDelete) return;
    if (
      !window.confirm(
        "Remove this broadcast for everyone on the site? (Admin only — other users keep seeing it until you do this.)",
      )
    ) {
      return;
    }
    setErr(null);
    try {
      const r = await fetch("/api/map/live", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error || "Could not delete");
        return;
      }
      await load({ silent: true });
    } catch {
      setErr("Network error");
    }
  };

  const visibleMessages = messages.filter((m) => !hiddenIds.has(m.id));

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const privateRepliesBlock = useMemo(() => {
    if (!signedIn) return null;
    return (
      <div
        className={
          L
            ? "rounded-2xl border border-zinc-200/90 bg-zinc-50/80 p-5 shadow-sm dark:border-zinc-700/80 dark:bg-zinc-900/40 sm:p-6"
            : "mt-4 rounded-xl border border-indigo-200/60 bg-gradient-to-b from-white/95 to-indigo-50/30 p-3 shadow-sm dark:border-indigo-900/40 dark:from-zinc-950/90 dark:to-indigo-950/20 sm:p-4"
        }
      >
        <h4
          className={
            L
              ? "text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
              : "text-xs font-semibold text-indigo-950 dark:text-indigo-100"
          }
        >
          {L ? "Recent conversations" : "Private replies"}
        </h4>
        <p className={`mt-1 text-zinc-600 dark:text-zinc-400 ${L ? "text-sm" : "hidden"}`}>
          Tap a thread to continue. Only you and the other boater can read these messages.
        </p>
        {inboxRows.length === 0 ? (
          <p
            className={`mt-3 rounded-xl border border-dashed px-3 py-4 text-center ${
              L
                ? "border-zinc-300/80 bg-white/80 text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-950/50 dark:text-zinc-400"
                : "rounded-lg border border-indigo-200/70 bg-white/60 text-[11px] text-indigo-800/70 dark:border-indigo-800/50 dark:bg-zinc-900/40 dark:text-indigo-200/70"
            }`}
          >
            {L ? "No direct messages yet. Start one above or wait for a friend to message you." : "No private chats yet."}
          </p>
        ) : (
          <ul className={`sealink-thread-scroll mt-4 space-y-2 overflow-y-auto pr-1 ${L ? "max-h-80" : "max-h-44"}`}>
            {inboxRows.map((row) => (
              <li key={row.threadId} className="flex gap-2">
                <button
                  type="button"
                  aria-label="Open private chat with this boater"
                  onClick={() => {
                    setChatContext(row.lastBody.trim().split(/\r?\n/)[0]?.slice(0, 120));
                    setChatPeerUid(row.peerUid);
                  }}
                  className={
                    L
                      ? "flex min-w-0 flex-1 flex-col rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600"
                      : "flex min-w-0 flex-1 flex-col rounded-xl border border-indigo-100/90 bg-white px-3 py-2.5 text-left shadow-sm ring-indigo-400/30 transition hover:border-indigo-300 hover:ring-2 dark:border-indigo-900/40 dark:bg-zinc-900/80 dark:hover:border-indigo-700"
                  }
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <span
                      className={
                        L
                          ? "text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                          : "text-xs font-semibold text-indigo-950 dark:text-indigo-100"
                      }
                    >
                      {L ? "Direct message" : "Conversation"}
                    </span>
                    <span
                      className={`truncate font-medium text-zinc-900 dark:text-zinc-100 ${L ? "max-w-[70%] text-sm" : "text-[10px] text-indigo-600/90 dark:text-indigo-300/90"}`}
                      title={row.peerUid}
                    >
                      {(() => {
                        const p = profileByUid[row.peerUid];
                        const label = p?.fullName && p?.boatName ? `${p.fullName} · ${p.boatName}` : p?.fullName || p?.boatName || "";
                        if (label) return label;
                        return row.peerUid.length > 18 ? `${row.peerUid.slice(0, 18)}…` : row.peerUid;
                      })()}
                    </span>
                  </div>
                  <span
                    className={`mt-1.5 line-clamp-3 text-zinc-800 dark:text-zinc-100 ${L ? "text-base leading-snug sm:text-lg" : "text-xs leading-snug"}`}
                  >
                    {row.lastBody}
                  </span>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={`text-zinc-500 dark:text-zinc-400 ${L ? "text-sm" : "text-[11px]"}`}>
                      {fmtTime(row.lastAt)}
                    </span>
                    {row.lastIsMine ? (
                      <span
                        className={`rounded-full bg-zinc-200/90 px-2 py-0.5 font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200 ${L ? "text-xs" : "text-[10px]"}`}
                      >
                        You sent last
                      </span>
                    ) : (
                      <span
                        className={`rounded-full bg-amber-200/90 px-2 py-0.5 font-semibold text-amber-950 dark:bg-amber-900/50 dark:text-amber-100 ${L ? "text-xs" : "text-[10px]"}`}
                      >
                        Awaiting your reply
                      </span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  disabled={deletingThreadId === row.threadId}
                  onClick={(e) => void onDeleteDmThread(row, e)}
                  className={`shrink-0 self-stretch rounded-xl border border-red-200 bg-red-50 font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/55 ${
                    L ? "px-3 py-2 text-base" : "px-2 py-1 text-[11px]"
                  }`}
                >
                  {deletingThreadId === row.threadId ? "…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }, [signedIn, inboxRows, L, deletingThreadId, profileByUid]);

  const startChatBlock = useMemo(() => {
    if (!signedIn || !L) return null;
    const friendOptions = ifmFriends
      .map((f) => ({
        uid: typeof f.uid === "string" ? f.uid.trim() : "",
        label: (() => {
          const uid = typeof f.uid === "string" ? f.uid.trim() : "";
          const p = uid ? profileByUid[uid] : undefined;
          const nice = p?.fullName && p?.boatName ? `${p.fullName} · ${p.boatName}` : p?.fullName || p?.boatName || "";
          if (nice) return nice;
          return f.kind === "email" ? f.value : f.kind === "phone" ? `${f.value} (phone)` : f.value;
        })(),
        kind: f.kind,
      }))
      .filter((o) => o.kind === "email" && o.uid);

    return (
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-700/80 dark:bg-zinc-950/60 sm:p-6">
        <h4 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">New direct message</h4>
        <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Choose someone from your IFM friends list. Manage friends on the{" "}
          <Link href="/ifm" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
            IFM map
          </Link>
          .
        </p>
        {friendOptions.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-5 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-400">
            No email friends yet. Add contacts on the IFM page to message them here.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="min-w-[min(100%,18rem)] flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Friend
              <select
                value={startChatPeerUid}
                onChange={(e) => setStartChatPeerUid(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
              >
                {friendOptions.map((o) => (
                  <option key={o.uid} value={o.uid}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!startChatPeerUid}
              onClick={() => {
                const uid = startChatPeerUid.trim();
                if (!uid) return;
                setChatContext("Conversation");
                setChatPeerUid(uid);
              }}
              className="h-11 shrink-0 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
            >
              Open chat
            </button>
          </div>
        )}
      </div>
    );
  }, [signedIn, L, ifmFriends, startChatPeerUid]);

  const showAreaSection = !L || !signedIn || messagingTab === "area";
  const showDirectSection = L && signedIn && messagingTab === "direct";

  return (
    <section
      className={
        L
          ? "rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 sm:p-6"
          : "rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/25"
      }
    >
      {L && signedIn ? (
        <div
          className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          role="tablist"
          aria-label="Message type"
        >
          <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-100/90 p-1 dark:border-zinc-700 dark:bg-zinc-950/80">
            <button
              type="button"
              role="tab"
              aria-selected={messagingTab === "direct"}
              onClick={() => setMessagingTab("direct")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                messagingTab === "direct"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              Direct messages
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={messagingTab === "area"}
              onClick={() => setMessagingTab("area")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                messagingTab === "area"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              Area broadcasts
            </button>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {messagingTab === "direct"
              ? "Private 1:1 chats with IFM friends."
              : "Public-style posts visible to nearby boaters (~5 mi), depending on audience."}
          </p>
        </div>
      ) : null}

      {L && !signedIn ? (
        <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-700 dark:bg-zinc-950/50 sm:px-5">
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            <Link href="/sign-in" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
              Sign in
            </Link>{" "}
            to send and receive direct messages. Area broadcasts below are still visible.
          </p>
        </div>
      ) : null}

      {showAreaSection ? (
        <>
      <h3
        className={
          L
            ? "text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            : "text-base font-semibold tracking-tight text-indigo-950 dark:text-indigo-100"
        }
      >
        Area broadcasts (~5 mi)
      </h3>
      <p
        className={`mt-1 leading-snug ${L ? "text-sm text-zinc-600 dark:text-zinc-400" : "text-[11px] text-indigo-900/85 dark:text-indigo-200/85"}`}
      >
        <strong className={`font-semibold ${L ? "text-zinc-800 dark:text-zinc-200" : "text-indigo-950 dark:text-indigo-100"}`}>
          Reply
        </strong>{" "}
        opens a shared thread on a new page.
      </p>

      <label
        className={`mt-3 inline-flex cursor-pointer items-center gap-2 font-medium ${L ? "text-sm text-zinc-800 dark:text-zinc-200" : "text-xs text-indigo-900 dark:text-indigo-200"}`}
      >
        <input
          type="checkbox"
          checked={soundOn}
          onChange={(e) => {
            const on = e.target.checked;
            setSoundOn(on);
            writeSoundOn(on);
          }}
          className="size-4 rounded border-indigo-300 text-indigo-700 focus:ring-indigo-600 dark:border-zinc-600"
        />
        Message alert sound
        <span className={`font-normal ${L ? "text-zinc-500 dark:text-zinc-400" : "text-indigo-800/70 dark:text-indigo-200/70"}`}>
          (defaults on)
        </span>
      </label>

      {err ? (
        <p
          className={`mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 ${
            L ? "px-3 py-2 text-sm" : "text-xs"
          }`}
        >
          {err}
        </p>
      ) : null}

      <div
        className={`mt-3 overflow-hidden rounded-xl border bg-white/90 dark:bg-zinc-950/60 ${
          L ? "border-zinc-200 dark:border-zinc-700" : "border-indigo-200/60 dark:border-indigo-900/40"
        }`}
      >
        <div
          className={`sealink-thread-scroll min-h-[4.5rem] space-y-2 overflow-y-auto scroll-smooth p-2 pr-1.5 ${
            L ? "max-h-[min(55vh,28rem)] sm:max-h-[min(60vh,32rem)]" : "max-h-[11rem] sm:max-h-[12rem]"
          }`}
          aria-busy={loading}
        >
        {loading ? null : visibleMessages.length === 0 ? (
          <p className={`px-2 py-3 text-indigo-800/80 dark:text-indigo-200/80 ${L ? "text-lg" : "text-xs"}`}>
            {messages.length === 0
              ? "No broadcasts in this area yet."
              : "No messages shown — hidden on this device. Others may still see them."}
          </p>
        ) : (
          visibleMessages.map((m) => {
            const allClear =
              !m.isMob && m.body.trimStart().startsWith(MOB_CANCEL_BROADCAST_INTRO);
            const mobMapHref =
              m.isMob || allClear ? mapHrefPreferCoords(m.body, m.lat, m.lng) : null;
            const canOpenThread =
              signedIn && Number.isFinite(readLat) && Number.isFinite(readLng);
            return (
              <article
                key={m.id}
                role={canOpenThread ? "button" : undefined}
                tabIndex={canOpenThread ? 0 : undefined}
                onKeyDown={
                  canOpenThread
                    ? (ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          openBroadcastChat(m);
                        }
                      }
                    : undefined
                }
                onClick={(ev) => {
                  if (!canOpenThread) return;
                  const el = ev.target as HTMLElement;
                  if (el.closest("button, a")) return;
                  openBroadcastChat(m);
                }}
                className={`rounded-md border px-2.5 py-2 dark:bg-zinc-900/80 ${L ? "px-3 py-3" : "text-sm"} ${
                  m.isMob
                    ? "border-red-400/90 bg-red-50/90 dark:border-red-800/70 dark:bg-red-950/35"
                    : allClear
                      ? "border-emerald-700/50 bg-emerald-50/90 dark:border-emerald-800/60 dark:bg-emerald-950/30"
                      : "border-indigo-100/80 bg-white dark:border-indigo-900/30"
                } ${canOpenThread ? "cursor-pointer transition hover:border-indigo-300 hover:shadow-sm dark:hover:border-indigo-600" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`font-medium text-indigo-600 dark:text-indigo-400 ${L ? "text-base leading-snug" : "text-[11px] leading-snug"}`}
                  >
                    {fmtTime(m.createdAt)}
                    {m.isMob ? (
                      <span
                        className={`ml-2 rounded bg-red-600 font-bold text-white dark:bg-red-700 ${L ? "px-2 py-1 text-sm" : "px-1 py-0.5 text-[10px]"}`}
                      >
                        MOB
                      </span>
                    ) : null}
                    {allClear ? (
                      <span
                        className={`ml-2 rounded bg-emerald-700 font-bold text-white dark:bg-emerald-800 ${L ? "px-2 py-1 text-sm" : "px-1 py-0.5 text-[10px]"}`}
                      >
                        All clear
                      </span>
                    ) : null}
                    {m.isGlobal ? (
                      <span
                        className={`ml-2 rounded bg-amber-100 text-amber-950 dark:bg-amber-900/50 dark:text-amber-100 ${L ? "px-2 py-1 text-sm" : "px-1 py-0.5 text-[10px]"}`}
                      >
                        All areas
                      </span>
                    ) : null}
                    {!m.isGlobal && m.audience === "friends_nearby" ? (
                      <span
                        className={`ml-2 rounded bg-violet-200/90 text-violet-950 dark:bg-violet-900/55 dark:text-violet-100 ${L ? "px-2 py-1 text-sm" : "px-1 py-0.5 text-[10px]"}`}
                        title="Only IFM friends within ~5 mi could see this"
                      >
                        Friends nearby
                      </span>
                    ) : null}
                    {!m.isGlobal && m.audience === "friends_global" ? (
                      <span
                        className={`ml-2 rounded bg-fuchsia-200/90 text-fuchsia-950 dark:bg-fuchsia-900/50 dark:text-fuchsia-50 ${L ? "px-2 py-1 text-sm" : "px-1 py-0.5 text-[10px]"}`}
                        title="Only your IFM friends (anywhere) could see this"
                      >
                        Friends worldwide
                      </span>
                    ) : null}
                    {m.isMine ? (
                      <span
                        className={`ml-2 rounded bg-indigo-100 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-100 ${L ? "px-2 py-1 text-sm" : "px-1 py-0.5 text-[10px]"}`}
                      >
                        You
                      </span>
                    ) : null}
                    {unreadBroadcastReplyIds.has(m.id) ? (
                      <span
                        className={`sealink-broadcast-new-replies ml-2 inline-block rounded-md px-2 py-0.5 font-bold text-white ${L ? "text-sm" : "text-[10px]"}`}
                      >
                        New replies
                      </span>
                    ) : null}
                  </p>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {signedIn && m.authorUid ? (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openBroadcastChat(m);
                        }}
                        className={`rounded-md border border-indigo-200 bg-indigo-50 font-semibold text-indigo-900 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-100 dark:hover:bg-indigo-900/40 ${
                          L ? "px-3 py-2 text-base" : "px-2 py-0.5 text-[11px]"
                        }`}
                      >
                        Reply
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Hide this message on this device only? It stays visible for other people.")) {
                          onHideOnDevice(m.id);
                        }
                      }}
                      className={`rounded-md border border-zinc-300 bg-zinc-100 font-semibold text-zinc-800 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 ${
                        L ? "px-3 py-2 text-base" : "px-2 py-0.5 text-[11px]"
                      }`}
                    >
                      Hide
                    </button>
                    {m.canAdminDelete ? (
                      <button
                        type="button"
                        onClick={() => void onAdminDelete(m)}
                        className={`rounded-md border border-red-200 bg-red-50 font-semibold text-red-800 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/55 ${
                          L ? "px-3 py-2 text-base" : "px-2 py-0.5 text-[11px]"
                        }`}
                      >
                        Admin delete
                      </button>
                    ) : null}
                  </div>
                </div>
                {mobMapHref ? (
                  <a
                    href={mobMapHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-2 inline-flex w-full items-center justify-center rounded-lg bg-sky-600 py-2 text-center font-bold text-white hover:bg-sky-500 ${
                      L ? "py-3 text-xl" : "text-xs sm:text-sm"
                    }`}
                  >
                    Open sender position on map
                  </a>
                ) : null}
                <div
                  className={`mt-1 whitespace-pre-wrap leading-snug text-zinc-800 dark:text-zinc-200 ${
                    L ? "text-lg leading-relaxed sm:text-xl" : ""
                  }`}
                >
                  <LinkifiedPlainText text={m.body} />
                </div>
              </article>
            );
          })
        )}
        </div>
      </div>

      {canSend && sendLat != null && sendLng != null ? (
        <form onSubmit={(e) => void onSend(e)} className="mt-3 space-y-2">
          {canSendGlobalBroadcast ? (
            <label
              className={`flex cursor-pointer items-start gap-2 font-medium text-indigo-900 dark:text-indigo-200 ${
                L ? "text-lg" : "text-xs"
              }`}
            >
              <input
                type="checkbox"
                checked={broadcastAllAreas}
                onChange={(e) => setBroadcastAllAreas(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 rounded border-indigo-300 text-indigo-700 focus:ring-indigo-600"
              />
              <span>
                Send to <strong className="font-semibold">all map areas</strong> (not only ~5 mi from here)
              </span>
            </label>
          ) : null}
          {!broadcastAllAreas ? (
            <fieldset
              className={`rounded-lg border border-indigo-200/80 bg-indigo-50/40 px-3 py-2 dark:border-indigo-800/60 dark:bg-indigo-950/25 ${L ? "space-y-2 py-3" : "space-y-1.5"}`}
            >
              <legend className={`px-1 font-semibold text-indigo-900 dark:text-indigo-100 ${L ? "text-base" : "text-xs"}`}>
                Who can see this
              </legend>
              <label className={`flex cursor-pointer items-start gap-2 text-indigo-900 dark:text-indigo-100 ${L ? "text-base" : "text-xs"}`}>
                <input
                  type="radio"
                  name="broadcastAudience"
                  checked={broadcastAudience === "all_nearby"}
                  onChange={() => setBroadcastAudience("all_nearby")}
                  className="mt-0.5 size-4 shrink-0 border-indigo-300 text-indigo-700 focus:ring-indigo-600"
                />
                <span>
                  <strong className="font-semibold">Everyone nearby</strong> (~5 mi)
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-2 text-indigo-900 dark:text-indigo-100 ${L ? "text-base" : "text-xs"}`}>
                <input
                  type="radio"
                  name="broadcastAudience"
                  checked={broadcastAudience === "friends_nearby"}
                  onChange={() => setBroadcastAudience("friends_nearby")}
                  className="mt-0.5 size-4 shrink-0 border-indigo-300 text-violet-700 focus:ring-violet-600"
                />
                <span>
                  <strong className="font-semibold">IFM friends nearby</strong> (~5 mi)
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-2 text-indigo-900 dark:text-indigo-100 ${L ? "text-base" : "text-xs"}`}>
                <input
                  type="radio"
                  name="broadcastAudience"
                  checked={broadcastAudience === "friends_global"}
                  onChange={() => setBroadcastAudience("friends_global")}
                  className="mt-0.5 size-4 shrink-0 border-indigo-300 text-fuchsia-700 focus:ring-fuchsia-600"
                />
                <span>
                  <strong className="font-semibold">IFM friends worldwide</strong>
                </span>
              </label>
              <p className={`text-indigo-800/85 dark:text-indigo-200/75 ${L ? "text-sm pl-6" : "text-[10px] leading-snug pl-6"}`}>
                Manage friends on the IFM map.
              </p>
            </fieldset>
          ) : null}
          <label
            className={`block font-medium text-indigo-900 dark:text-indigo-200 ${L ? "text-lg" : "text-xs"}`}
          >
            {broadcastAllAreas && canSendGlobalBroadcast
              ? "Broadcast (all areas)"
              : broadcastAudience === "friends_nearby"
                ? "Message (IFM friends within ~5 mi)"
                : broadcastAudience === "friends_global"
                  ? "Message (IFM friends worldwide)"
                  : "Broadcast to ~5 mi"}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={L ? 4 : 3}
              maxLength={500}
              placeholder={
                broadcastAudience === "friends_nearby"
                  ? "Heads-up for IFM friends in range…"
                  : broadcastAudience === "friends_global"
                    ? "Heads-up for your IFM friends anywhere…"
                    : "Short heads-up for nearby boaters…"
              }
              className={`mt-1 w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-zinc-900 outline-none focus:border-indigo-500 dark:border-indigo-800 dark:bg-zinc-950 dark:text-zinc-50 ${
                L ? "py-3 text-base sm:text-lg" : "text-sm"
              }`}
            />
          </label>
          <button
            type="submit"
            disabled={posting || !draft.trim()}
            className={`rounded-lg bg-indigo-700 px-3 font-semibold text-white hover:bg-indigo-800 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500 ${
              L ? "h-11 text-base" : "h-9 text-sm"
            }`}
          >
            {posting
              ? "Sending…"
              : broadcastAllAreas && canSendGlobalBroadcast
                ? "Send to all areas"
                : broadcastAudience === "friends_nearby"
                  ? "Send to friends nearby"
                  : broadcastAudience === "friends_global"
                    ? "Send to friends worldwide"
                    : "Send broadcast"}
          </button>
        </form>
      ) : (
        <p className={`mt-3 text-indigo-900/85 dark:text-indigo-200/80 ${L ? "text-sm leading-relaxed text-zinc-600 dark:text-zinc-400" : "text-xs"}`}>
          Turn on <strong className="text-zinc-800 dark:text-zinc-200">Share my location on this map</strong> on the{" "}
          <Link
            href="/"
            className="font-semibold text-indigo-600 underline underline-offset-2 hover:text-indigo-500 dark:text-indigo-400"
          >
            home map
          </Link>{" "}
          to send a broadcast from your current position.
        </p>
      )}
        </>
      ) : null}

      {showDirectSection ? (
        <div className="space-y-6">
          {startChatBlock}
          {privateRepliesBlock}
        </div>
      ) : null}

      {!L && signedIn ? privateRepliesBlock : null}

      {chatPeerUid ? (
        <VicinityChatDrawer
          open
          peerUid={chatPeerUid}
          readLat={readLat}
          readLng={readLng}
          contextLine={chatContext}
          textScale={L ? "readable" : "default"}
          onClose={() => {
            setChatPeerUid(null);
            setChatContext(undefined);
            void fetchInbox();
          }}
        />
      ) : null}
    </section>
  );
}
