"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBroadcastToast } from "@/components/BroadcastToastProvider";
import { VicinityChatDrawer } from "@/components/home/VicinityChatDrawer";
import { LinkifiedPlainText } from "@/components/LinkifiedPlainText";
import { mapHrefPreferCoords } from "@/lib/map-links";
import { MOB_CANCEL_BROADCAST_INTRO } from "@/lib/map-broadcast-constants";
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
}: Props) {
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
  const [broadcastAllAreas, setBroadcastAllAreas] = useState(false);
  const [inboxRows, setInboxRows] = useState<VicinityInboxRowApi[]>([]);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
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

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const { readLat: lat, readLng: lng } = coordsRef.current;
    if (!silent) {
      setLoading(true);
      setErr(null);
    }
    try {
      const r = await fetch(
        `/api/map/broadcast?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
      );
      const d = (await r.json()) as { messages?: BroadcastMsg[]; error?: string };
      if (!r.ok) {
        if (!silent) {
          setErr(d.error || "Could not load broadcasts");
          setMessages([]);
        }
        return;
      }
      const msgs = Array.isArray(d.messages) ? d.messages : [];
      setMessages(msgs);
      if (silent) setErr(null);

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

  const POLL_MS = 60_000;

  useEffect(() => {
    queueMicrotask(() => void load());
    const id = window.setInterval(() => queueMicrotask(() => void load({ silent: true })), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

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
      const r = await fetch("/api/vicinity-chat/inbox");
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

  useEffect(() => {
    if (!signedIn) return;
    queueMicrotask(() => void fetchInbox());
    const id = window.setInterval(() => queueMicrotask(() => void fetchInbox()), 55_000);
    return () => window.clearInterval(id);
  }, [signedIn, fetchInbox]);

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
      const r = await fetch("/api/map/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: sendLat,
          lng: sendLng,
          text,
          ...(canSendGlobalBroadcast && broadcastAllAreas ? { broadcastAllAreas: true } : {}),
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error || "Could not send");
        return;
      }
      setDraft("");
      setBroadcastAllAreas(false);
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
      const r = await fetch("/api/map/broadcast", {
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

  return (
    <section
      className={`rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/25 ${
        L ? "mx-auto max-w-4xl p-5 sm:p-6" : ""
      }`}
    >
      <h3
        className={
          L
            ? "text-2xl font-bold tracking-tight text-indigo-950 sm:text-3xl dark:text-indigo-100"
            : "text-base font-semibold tracking-tight text-indigo-950 dark:text-indigo-100"
        }
      >
        Area broadcasts (~5 mi)
      </h3>

      <label
        className={`mt-2 inline-flex cursor-pointer items-center gap-2 font-medium text-indigo-900 dark:text-indigo-200 ${
          L ? "text-lg" : "text-xs"
        }`}
      >
        <input
          type="checkbox"
          checked={soundOn}
          onChange={(e) => {
            const on = e.target.checked;
            setSoundOn(on);
            writeSoundOn(on);
          }}
          className="size-4 rounded border-indigo-300 text-indigo-700 focus:ring-indigo-600"
        />
        Message alert sound
        <span className="font-normal text-indigo-800/70 dark:text-indigo-200/70">(defaults on)</span>
      </label>

      {err ? (
        <p
          className={`mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 ${
            L ? "px-3 py-2 text-lg" : "text-xs"
          }`}
        >
          {err}
        </p>
      ) : null}

      <div className="mt-3 overflow-hidden rounded-lg border border-indigo-200/60 bg-white/90 dark:border-indigo-900/40 dark:bg-zinc-950/60">
        <div
          className={`min-h-[4.5rem] space-y-2 overflow-y-auto scroll-smooth p-2 ${
            L ? "max-h-[min(55vh,28rem)] sm:max-h-[min(60vh,32rem)]" : "max-h-[11rem] sm:max-h-[12rem]"
          }`}
        >
        {loading ? (
          <p className={`px-2 py-3 text-indigo-700 dark:text-indigo-300 ${L ? "text-lg" : "text-xs"}`}>Loading…</p>
        ) : visibleMessages.length === 0 ? (
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
            return (
              <article
                key={m.id}
                className={`rounded-md border px-2.5 py-2 dark:bg-zinc-900/80 ${L ? "px-3 py-3" : "text-sm"} ${
                  m.isMob
                    ? "border-red-400/90 bg-red-50/90 dark:border-red-800/70 dark:bg-red-950/35"
                    : allClear
                      ? "border-emerald-700/50 bg-emerald-50/90 dark:border-emerald-800/60 dark:bg-emerald-950/30"
                      : "border-indigo-100/80 bg-white dark:border-indigo-900/30"
                }`}
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
                    {m.isMine ? (
                      <span
                        className={`ml-2 rounded bg-indigo-100 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-100 ${L ? "px-2 py-1 text-sm" : "px-1 py-0.5 text-[10px]"}`}
                      >
                        You
                      </span>
                    ) : null}
                  </p>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {signedIn && !m.isMine && m.authorUid ? (
                      <button
                        type="button"
                        onClick={() => {
                          setChatContext(m.body.trim().split(/\r?\n/)[0]?.slice(0, 120) ?? "");
                          setChatPeerUid(m.authorUid);
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
                    L ? "text-2xl leading-snug sm:text-3xl" : ""
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

      {signedIn ? (
        <div className="mt-4 rounded-lg border border-indigo-200/50 bg-white/50 p-3 dark:border-indigo-900/40 dark:bg-zinc-950/50">
          <h4 className={`font-semibold text-indigo-950 dark:text-indigo-100 ${L ? "text-xl" : "text-xs"}`}>
            Vicinity replies (direct messages)
          </h4>
          <p
            className={`mt-1 leading-snug text-indigo-900/75 dark:text-indigo-200/80 ${L ? "text-base" : "text-[11px]"}`}
          >
            <strong className="font-semibold">Seen</strong> closes the chat but keeps all messages;{" "}
            <strong className="font-semibold">tap this row</strong> (preview) to reopen.{" "}
            <strong className="font-semibold">Delete</strong> removes the whole thread for both people.
          </p>
          {inboxRows.length === 0 ? (
            <p className={`mt-2 text-indigo-800/60 dark:text-indigo-300/70 ${L ? "text-base" : "text-[11px]"}`}>No DM threads yet.</p>
          ) : (
            <ul className={`mt-2 space-y-1.5 overflow-y-auto ${L ? "max-h-72" : "max-h-40"}`}>
              {inboxRows.map((row) => (
                <li key={row.threadId} className="flex gap-1.5">
                  <button
                    type="button"
                    aria-label="Open vicinity chat. Tap again after Seen to reopen."
                    onClick={() => {
                      setChatContext(row.lastBody.trim().split(/\r?\n/)[0]?.slice(0, 120));
                      setChatPeerUid(row.peerUid);
                    }}
                    className={`flex min-w-0 flex-1 flex-col rounded-md border border-indigo-100 bg-white px-2 py-2 text-left hover:bg-indigo-50/80 dark:border-indigo-900/35 dark:bg-zinc-900/70 dark:hover:bg-zinc-900 ${
                      L ? "px-3 py-3" : "text-xs"
                    }`}
                  >
                    <span
                      className={`font-mono text-indigo-700/80 dark:text-indigo-300/90 ${L ? "text-base" : "text-[11px]"}`}
                    >
                      {row.peerUid.length > 14 ? `${row.peerUid.slice(0, 14)}…` : row.peerUid}
                      {row.lastIsMine ? (
                        <span className="ml-2 font-sans font-normal text-zinc-500 dark:text-zinc-400">· You last</span>
                      ) : (
                        <span className="ml-2 font-sans font-semibold text-amber-700 dark:text-amber-400">· Awaiting you</span>
                      )}
                    </span>
                    <span
                      className={`mt-0.5 line-clamp-2 text-zinc-800 dark:text-zinc-200 ${L ? "text-xl leading-snug sm:text-2xl" : ""}`}
                    >
                      {row.lastBody}
                    </span>
                    <span className={`mt-0.5 text-zinc-500 dark:text-zinc-400 ${L ? "text-base" : "text-[11px]"}`}>
                      {fmtTime(row.lastAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={deletingThreadId === row.threadId}
                    onClick={(e) => void onDeleteDmThread(row, e)}
                    className={`shrink-0 self-stretch rounded-md border border-red-200 bg-red-50 font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/55 ${
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
      ) : null}

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
          <label
            className={`block font-medium text-indigo-900 dark:text-indigo-200 ${L ? "text-lg" : "text-xs"}`}
          >
            {broadcastAllAreas && canSendGlobalBroadcast ? "Broadcast (all areas)" : "Broadcast to ~5 mi"}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={L ? 4 : 3}
              maxLength={500}
              placeholder="Short heads-up for nearby boaters…"
              className={`mt-1 w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-zinc-900 outline-none focus:border-indigo-500 dark:border-indigo-800 dark:bg-zinc-950 dark:text-zinc-50 ${
                L ? "py-3 text-xl sm:text-2xl" : "text-sm"
              }`}
            />
          </label>
          <button
            type="submit"
            disabled={posting || !draft.trim()}
            className={`rounded-lg bg-indigo-700 px-3 font-semibold text-white hover:bg-indigo-800 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500 ${
              L ? "h-12 text-lg" : "h-9 text-sm"
            }`}
          >
            {posting ? "Sending…" : broadcastAllAreas && canSendGlobalBroadcast ? "Send to all areas" : "Send broadcast"}
          </button>
        </form>
      ) : (
        <p className={`mt-3 text-indigo-900/85 dark:text-indigo-200/80 ${L ? "text-lg leading-relaxed" : "text-xs"}`}>
          Turn on <strong>Share my location on this map</strong> on the{" "}
          <Link
            href="/"
            className="font-semibold text-green-800 underline underline-offset-2 hover:text-green-700 dark:text-green-400"
          >
            home map
          </Link>{" "}
          to send a broadcast from your current position.
        </p>
      )}

      {chatPeerUid ? (
        <VicinityChatDrawer
          open
          peerUid={chatPeerUid}
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
