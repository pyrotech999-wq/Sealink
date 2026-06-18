"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBroadcastToast } from "@/components/BroadcastToastProvider";
import { MobileVicinityChatDrawer } from "./MobileVicinityChatDrawer";
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
import { getShareOnMap } from "@/lib/map-profile-storage";
import { getLastKnownPosition } from "@/lib/map-last-known";
import { DEFAULT_MAP_CENTER } from "@/lib/map-constants";
import { setMessagingLastVisitNow } from "@/lib/messaging-last-visit";
import { MessageSquare, Radio, Users, Globe, Volume2, Shield, PlusCircle, Navigation, Trash2, Send } from "lucide-react";

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
  audience?: MapBroadcastAudience;
};

type Props = {
  signedIn: boolean;
  canSendGlobalBroadcast?: boolean;
};

export default function MobileMessagesPanel({
  signedIn,
  canSendGlobalBroadcast = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialOpenPeerUid = searchParams.get("open")?.trim() || null;

  const [sharing, setSharing] = useState(false);
  const [, setTick] = useState(0);

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

  const last = typeof window !== "undefined" ? getLastKnownPosition() : null;
  const readLat = last?.lat ?? DEFAULT_MAP_CENTER.lat;
  const readLng = last?.lng ?? DEFAULT_MAP_CENTER.lng;
  const canSend = Boolean(sharing && last);
  const sendLat = canSend ? last!.lat : null;
  const sendLng = canSend ? last!.lng : null;

  const coordsRef = useRef({ readLat, readLng });
  const toastRef = useRef(toast);

  useEffect(() => {
    coordsRef.current = { readLat, readLng };
  }, [readLat, readLng]);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    setMessagingLastVisitNow();
  }, []);

  // Sync share on map setting
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

  // Handle direct navigation to DM from search params
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

  const surfaceNewAreaBroadcastAlerts = useCallback((msgs: BroadcastMsg[]) => {
    const newest = msgs[0]?.createdAt;
    if (!newest) return;
    const wl = readWaterline();
    if (wl == null) {
      writeWaterline(newest);
      return;
    }
    const t = toastRef.current;
    if (t) {
      for (const m of msgs) {
        if (new Date(m.createdAt) <= new Date(wl)) break;
        if (m.isMob) continue;
        if (!m.isMine) t.pushToast(m.body, "broadcast", { id: m.id });
      }
    }
    writeWaterline(newest);
  }, []);

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

      surfaceNewAreaBroadcastAlerts(msgs);
    } catch {
      if (!silent) {
        setErr("Network error loading broadcasts.");
        setMessages([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [surfaceNewAreaBroadcastAlerts]);

  useEffect(() => {
    if (!signedIn) return;
    const unsub = subscribeMapLive({
      id: "MobileMessagesPanel",
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
        surfaceNewAreaBroadcastAlerts(msgs);
      },
    });
    queueMicrotask(() => void load());
    return unsub;
  }, [load, signedIn, surfaceNewAreaBroadcastAlerts]);

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

  // Lookup profile information for threads/inbox rows
  useEffect(() => {
    if (!signedIn) return;
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
  }, [signedIn, inboxRows, ifmFriends, profileByUid]);

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
    new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  // Unique avatar color gradient generator based on user UID
  const getAvatarGradient = (uid: string) => {
    const charSum = uid.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const gradients = [
      "from-cyan-500 to-blue-600",
      "from-indigo-500 to-purple-600",
      "from-fuchsia-500 to-pink-600",
      "from-emerald-500 to-teal-600",
      "from-amber-500 to-orange-600",
    ];
    return gradients[charSum % gradients.length];
  };

  const friendOptions = useMemo(() => {
    if (!signedIn) return [];
    return ifmFriends
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
  }, [signedIn, ifmFriends, profileByUid]);

  return (
    <div className="fixed inset-0 bg-[#071b36] text-white flex flex-col overflow-hidden">
      {/* HEADER SECTION */}
      <div className="shrink-0 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3 bg-[#071b36] border-b border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] font-extrabold tracking-tight">Comms Center</h1>
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping mt-1.5" />
          </div>
          <Link href="/profile" className="text-xs font-bold text-slate-400 bg-white/[0.05] border border-white/[0.08] px-3 py-1.5 rounded-full hover:bg-white/[0.1] active:scale-95 transition-all">
            Profile Settings
          </Link>
        </div>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed max-w-sm">
          Secure private links with registered friends and area-wide local broadcasts.
        </p>

        {/* Global Sign In Message if anonymous */}
        {!signedIn && (
          <div className="mt-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
            <div className="flex items-center gap-2.5 min-w-0">
              <Shield size={18} className="text-indigo-400 shrink-0" />
              <p className="text-xs text-slate-300">Sign in to start private direct messages with your IFM contacts.</p>
            </div>
            <Link
              href="/sign-in"
              className="w-full sm:w-auto text-center px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-all active:scale-95 shrink-0"
            >
              Sign In
            </Link>
          </div>
        )}
      </div>

      {/* NAV TABS & SOUND ACCENTS */}
      <div className="shrink-0 px-5 py-4 bg-[#071b36] flex flex-col gap-3">
        {signedIn && (
          <div className="flex rounded-2xl bg-white/[0.04] p-1 border border-white/[0.08] backdrop-blur-md">
            <button
              type="button"
              onClick={() => setMessagingTab("direct")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-extrabold tracking-wide uppercase transition-all duration-300 ${messagingTab === "direct"
                ? "bg-[#112440] text-cyan-400 border border-white/[0.08] shadow-[0_4px_15px_rgba(0,0,0,0.25)]"
                : "text-slate-400 hover:text-slate-200"
                }`}
            >
              <MessageSquare size={14} />
              Direct Link
            </button>
            <button
              type="button"
              onClick={() => setMessagingTab("area")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-extrabold tracking-wide uppercase transition-all duration-300 ${messagingTab === "area"
                ? "bg-[#112440] text-cyan-400 border border-white/[0.08] shadow-[0_4px_15px_rgba(0,0,0,0.25)]"
                : "text-slate-400 hover:text-slate-200"
                }`}
            >
              <Radio size={14} />
              Area Alert
            </button>
          </div>
        )}

        {/* Message Alert Sound Switcher */}
        {messagingTab === "area" && (
          <div className="flex items-center justify-between bg-white/[0.03] border border-white/[0.05] rounded-2xl px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <Volume2 size={16} className={soundOn ? "text-cyan-400" : "text-slate-500"} />
              <span className="text-xs font-bold text-slate-300">Incoming Alert Tones</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={soundOn}
                onChange={(e) => {
                  const on = e.target.checked;
                  setSoundOn(on);
                  writeSoundOn(on);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-cyan-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-950/50 border border-white/10 peer-checked:border-cyan-500/20"></div>
            </label>
          </div>
        )}
      </div>

      {/* ERROR TOAST CONTAINER */}
      {err && (
        <div className="mx-5 mb-2 rounded-xl border border-red-500/20 bg-red-500/15 p-3 text-center text-xs text-red-400">
          {err}
        </div>
      )}

      {/* SCROLLABLE VIEWPORT AREA */}
      <div className="flex-1 overflow-y-auto px-5 pb-28">

        {/* DIRECT MESSAGES SECTION */}
        {signedIn && messagingTab === "direct" && (
          <div className="space-y-5">

            {/* Start chat block */}
            <div className="rounded-[24px] border border-white/[0.06] bg-gradient-to-br from-[#112139]/50 to-[#071120]/75 p-5 backdrop-blur-md shadow-xl">
              <div className="flex items-center gap-2">
                <PlusCircle size={16} className="text-cyan-400" />
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Establish New DM</h4>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Start a 1:1 chat thread with contacts approved on the IFM Map.
              </p>

              {friendOptions.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-center text-xs text-slate-400">
                  No direct contacts available. Add boaters on the IFM map first.
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="relative">
                    <select
                      value={startChatPeerUid}
                      onChange={(e) => setStartChatPeerUid(e.target.value)}
                      className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white outline-none focus:border-cyan-500/50 appearance-none"
                    >
                      {friendOptions.map((o) => (
                        <option key={o.uid} value={o.uid} className="bg-[#0c1a30] text-white">
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!startChatPeerUid}
                    onClick={() => {
                      const uid = startChatPeerUid.trim();
                      if (!uid) return;
                      setChatContext("Conversation");
                      setChatPeerUid(uid);
                    }}
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 active:scale-[0.98] text-xs font-bold text-white shadow-lg transition-all"
                  >
                    Open Chat Console
                  </button>
                </div>
              )}
            </div>

            {/* Conversation Inbox List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Recent Conversations</h4>

              {inboxRows.length === 0 ? (
                <div className="rounded-[24px] border border-white/[0.06] bg-gradient-to-b from-[#112139]/40 to-[#071120]/40 p-8 text-center text-xs text-slate-500">
                  No active channels found. Use the DM picker above or maps to communicate.
                </div>
              ) : (
                inboxRows.map((row) => {
                  const p = profileByUid[row.peerUid];
                  const label = p?.fullName && p?.boatName ? `${p.fullName} · ${p.boatName}` : p?.fullName || p?.boatName || null;
                  const peerShort = row.peerUid.length > 18 ? `${row.peerUid.slice(0, 18)}…` : row.peerUid;
                  const initials = (label || row.peerUid).slice(0, 2).toUpperCase();

                  return (
                    <div
                      key={row.threadId}
                      className="group relative flex w-full gap-3.5 items-center rounded-[24px] border border-white/[0.06] bg-gradient-to-br from-[#112139]/80 to-[#071120]/95 p-4 shadow-xl backdrop-blur-md active:scale-[0.99] transition-all"
                      onClick={() => {
                        setChatContext(row.lastBody.trim().split(/\r?\n/)[0]?.slice(0, 120));
                        setChatPeerUid(row.peerUid);
                      }}
                    >
                      {/* Avatar with dynamic matching gradient */}
                      <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(row.peerUid)} text-white font-extrabold text-sm border border-white/20 shadow-md`}>
                        {initials}
                        {/* Live channel dot indicator */}
                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[#091428] animate-pulse" />
                      </div>

                      {/* Msg text details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <p className="truncate text-sm font-extrabold text-white">
                            {label ?? peerShort}
                          </p>
                          <span className="shrink-0 text-[10px] font-semibold text-slate-500">
                            {fmtTime(row.lastAt)}
                          </span>
                        </div>

                        <p className="mt-1 truncate text-xs text-slate-400">
                          {row.lastBody}
                        </p>

                        <div className="mt-2.5 flex items-center gap-2">
                          {row.lastIsMine ? (
                            <span className="inline-block rounded-full bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 text-[9px] font-bold text-slate-400 tracking-wider uppercase">
                              Sent
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[9px] font-extrabold text-amber-300 tracking-wider uppercase animate-pulse">
                              Action needed
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Delete control overlay */}
                      <button
                        type="button"
                        disabled={deletingThreadId === row.threadId}
                        onClick={(e) => void onDeleteDmThread(row, e)}
                        className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/20 active:scale-95 transition-all shrink-0 self-center"
                        title="Delete Channel"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        )}

        {/* AREA BROADCASTS SECTION */}
        {messagingTab === "area" && (
          <div className="space-y-5">

            {/* Compose area broadcast widget */}
            {canSend && sendLat != null && sendLng != null ? (
              <form
                onSubmit={(e) => void onSend(e)}
                className="rounded-[24px] border border-white/[0.06] bg-gradient-to-br from-[#112139]/50 to-[#071120]/75 p-5 backdrop-blur-md shadow-xl space-y-4"
              >
                <div className="flex items-center gap-2">
                  <Radio size={16} className="text-cyan-400 animate-pulse" />
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Transmit Broadcast</h4>
                </div>

                {/* Optional global broadcast choice */}
                {canSendGlobalBroadcast && (
                  <label className="flex items-start gap-2.5 bg-white/[0.03] border border-white/[0.05] rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={broadcastAllAreas}
                      onChange={(e) => setBroadcastAllAreas(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 rounded border-white/20 bg-slate-900 text-cyan-600"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">Global Broadcast Range</span>
                      <span className="text-[10px] text-slate-400 block leading-tight mt-0.5">Override standard range limit to transmit to all regions worldwide.</span>
                    </div>
                  </label>
                )}

                {/* Segmented Button Selection Grid for Audience */}
                {!broadcastAllAreas && (
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider pl-1">Audience Range</span>
                    <div className="grid grid-cols-3 gap-1.5 bg-black/20 p-1 rounded-2xl border border-white/[0.04]">
                      <button
                        type="button"
                        onClick={() => setBroadcastAudience("all_nearby")}
                        className={`flex flex-col items-center py-2 px-1 rounded-xl text-[10px] font-bold transition-all ${broadcastAudience === "all_nearby"
                          ? "bg-[#112440] text-cyan-400 border border-cyan-500/20"
                          : "text-slate-400 hover:text-slate-200"
                          }`}
                      >
                        <Globe size={13} className="mb-1" />
                        Everyone
                      </button>
                      <button
                        type="button"
                        onClick={() => setBroadcastAudience("friends_nearby")}
                        className={`flex flex-col items-center py-2 px-1 rounded-xl text-[10px] font-bold transition-all ${broadcastAudience === "friends_nearby"
                          ? "bg-[#112440] text-cyan-400 border border-cyan-500/20"
                          : "text-slate-400 hover:text-slate-200"
                          }`}
                      >
                        <Users size={13} className="mb-1" />
                        Friends (L)
                      </button>
                      <button
                        type="button"
                        onClick={() => setBroadcastAudience("friends_global")}
                        className={`flex flex-col items-center py-2 px-1 rounded-xl text-[10px] font-bold transition-all ${broadcastAudience === "friends_global"
                          ? "bg-[#112440] text-cyan-400 border border-cyan-500/20"
                          : "text-slate-400 hover:text-slate-200"
                          }`}
                      >
                        <Globe size={13} className="mb-1" />
                        Friends (G)
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 pl-1 leading-snug">
                      {broadcastAudience === "all_nearby" && "Transmit public message to all boaters in a ~5 mi radius."}
                      {broadcastAudience === "friends_nearby" && "Transmit secure message visible ONLY to IFM friends in a ~5 mi radius."}
                      {broadcastAudience === "friends_global" && "Transmit secure message visible to all approved IFM friends worldwide."}
                    </p>
                  </div>
                )}

                {/* Input Textarea and Send triggers */}
                <div className="space-y-1.5">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder={
                      broadcastAudience === "friends_nearby"
                        ? "Enter secure range transmission message..."
                        : broadcastAudience === "friends_global"
                          ? "Enter global contact transmission message..."
                          : "Enter public area broadcast signal..."
                    }
                    className="w-full rounded-2xl border border-white/[0.08] bg-[#0c1a30] p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all resize-none"
                  />
                  <div className="flex justify-between items-center text-[10px] text-slate-500 px-1">
                    <span>Max 500 characters</span>
                    <span>{draft.length}/500</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={posting || !draft.trim()}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 active:scale-[0.98] text-xs font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={14} />
                  {posting ? "Transmitting..." : "Send Broadcast Signal"}
                </button>
              </form>
            ) : (
              <div className="rounded-[24px] border border-white/[0.06] bg-gradient-to-br from-[#112139]/40 to-[#071120]/40 p-5 backdrop-blur-md shadow-xl text-center">
                <span className="text-slate-400 text-xs">
                  Turn on <strong className="text-white">Share my location</strong> on the home map to compose and send area broadcasts.
                </span>
              </div>
            )}

            {/* Broadcast feed list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pl-1">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Signals (Nearby ~5mi)</h4>
                {loading && <span className="text-[10px] font-bold text-cyan-400 animate-pulse">Syncing...</span>}
              </div>

              {loading ? (
                <div className="py-12 text-center text-xs text-slate-400 animate-pulse">
                  Connecting to live area map channels...
                </div>
              ) : visibleMessages.length === 0 ? (
                <div className="rounded-[24px] border border-white/[0.06] bg-gradient-to-b from-[#112139]/40 to-[#071120]/40 p-8 text-center text-xs text-slate-500">
                  {messages.length === 0
                    ? "Silence on all frequencies. No nearby broadcasts found."
                    : "No signals showing (hidden on this device)."}
                </div>
              ) : (
                visibleMessages.map((m) => {
                  const allClear = !m.isMob && m.body.trimStart().startsWith(MOB_CANCEL_BROADCAST_INTRO);
                  const mobMapHref = m.isMob || allClear ? mapHrefPreferCoords(m.body, m.lat, m.lng) : null;
                  const canOpenThread = signedIn && Number.isFinite(readLat) && Number.isFinite(readLng);

                  // Setup container border styles based on message flags
                  let cardBorder = "border-white/[0.06] bg-gradient-to-br from-[#112139]/80 to-[#071120]/95 shadow-xl";
                  if (m.isMob) {
                    cardBorder = "border-red-500 bg-red-950/20 shadow-[0_0_15px_rgba(239,68,68,0.25)] animate-pulse";
                  } else if (allClear) {
                    cardBorder = "border-emerald-500/30 bg-emerald-950/15";
                  }

                  return (
                    <article
                      key={m.id}
                      onClick={(ev) => {
                        if (!canOpenThread) return;
                        const el = ev.target as HTMLElement;
                        if (el.closest("button, a")) return;
                        openBroadcastChat(m);
                      }}
                      className={`rounded-[24px] border p-4 backdrop-blur-md flex flex-col gap-3 transition-all ${cardBorder} ${canOpenThread ? "active:scale-[0.99] cursor-pointer" : ""
                        }`}
                    >
                      {/* Meta header block */}
                      <div className="flex items-start justify-between gap-2 border-b border-white/[0.04] pb-2.5">
                        <div className="min-w-0">
                          <span className="text-[10px] font-semibold text-slate-400">
                            {fmtTime(m.createdAt)}
                          </span>

                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {m.isMob && (
                              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-black text-white uppercase tracking-wider animate-bounce">
                                🚨 MOB ALERT
                              </span>
                            )}
                            {allClear && (
                              <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-extrabold text-white uppercase tracking-wider">
                                ✅ ALL CLEAR
                              </span>
                            )}
                            {m.isGlobal && (
                              <span className="rounded bg-amber-500/20 border border-amber-500/35 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-300 uppercase tracking-wider">
                                Global
                              </span>
                            )}
                            {!m.isGlobal && m.audience === "friends_nearby" && (
                              <span className="rounded bg-indigo-500/20 border border-indigo-500/35 px-1.5 py-0.5 text-[9px] font-extrabold text-indigo-300 uppercase tracking-wider">
                                Contacts Range
                              </span>
                            )}
                            {!m.isGlobal && m.audience === "friends_global" && (
                              <span className="rounded bg-fuchsia-500/20 border border-fuchsia-500/35 px-1.5 py-0.5 text-[9px] font-extrabold text-fuchsia-300 uppercase tracking-wider">
                                Contacts Global
                              </span>
                            )}
                            {m.isMine && (
                              <span className="rounded bg-blue-500/20 border border-blue-500/35 px-1.5 py-0.5 text-[9px] font-extrabold text-blue-300 uppercase tracking-wider">
                                You
                              </span>
                            )}
                            {unreadBroadcastReplyIds.has(m.id) && (
                              <span className="rounded bg-cyan-500 text-black px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.6)]">
                                New Reply
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Interactive triggers */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {signedIn && m.authorUid && (
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openBroadcastChat(m);
                              }}
                              className="px-2.5 py-1 text-[10px] font-extrabold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 rounded-xl hover:bg-cyan-500/20 transition-all uppercase tracking-wider"
                            >
                              Reply
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (window.confirm("Hide this message on this device only? It stays visible for other people.")) {
                                onHideOnDevice(m.id);
                              }
                            }}
                            className="px-2.5 py-1 text-[10px] font-extrabold bg-white/[0.05] border border-white/[0.08] text-slate-300 rounded-xl hover:bg-white/[0.1] transition-all uppercase tracking-wider"
                          >
                            Hide
                          </button>
                          {m.canAdminDelete && (
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                void onAdminDelete(m);
                              }}
                              className="px-2.5 py-1 text-[10px] font-extrabold bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/20 transition-all uppercase tracking-wider"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Map Location Link */}
                      {mobMapHref && (
                        <a
                          href={mobMapHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full bg-[#112440] hover:bg-[#163056] border border-cyan-500/30 text-cyan-400 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-[0_0_10px_rgba(6,182,212,0.08)]"
                        >
                          <Navigation size={13} className="rotate-45" />
                          Plot Position on Map
                        </a>
                      )}

                      {/* Content message text */}
                      <div className="text-xs sm:text-sm text-slate-200 leading-relaxed break-words whitespace-pre-wrap">
                        <LinkifiedPlainText text={m.body} />
                      </div>
                    </article>
                  );
                })
              )}
            </div>

          </div>
        )}
      </div>

      {/* PRIVATE 1:1 CHAT CONSOLE DRAWER */}
      {chatPeerUid && (
        <MobileVicinityChatDrawer
          open
          peerUid={chatPeerUid}
          readLat={readLat}
          readLng={readLng}
          contextLine={chatContext}
          textScale="default"
          onClose={() => {
            setChatPeerUid(null);
            setChatContext(undefined);
            void fetchInbox();
          }}
        />
      )}
    </div>
  );
}
