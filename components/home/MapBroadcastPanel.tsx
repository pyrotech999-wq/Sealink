"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBroadcastToast } from "@/components/BroadcastToastProvider";
import { VicinityChatDrawer } from "@/components/home/VicinityChatDrawer";
import { MAP_BROADCAST_RETENTION_HOURS } from "@/lib/map-broadcast-constants";

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
  body: string;
  createdAt: string;
  isMine: boolean;
  canDelete?: boolean;
  isGlobal?: boolean;
};

type Props = {
  signedIn: boolean;
  canSendGlobalBroadcast?: boolean;
  readLat: number;
  readLng: number;
  canSend: boolean;
  sendLat: number | null;
  sendLng: number | null;
};

export function MapBroadcastPanel({
  signedIn,
  canSendGlobalBroadcast = false,
  readLat,
  readLng,
  canSend,
  sendLat,
  sendLng,
}: Props) {
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

  const coordsRef = useRef({ readLat, readLng });
  coordsRef.current = { readLat, readLng };
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

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
    void fetchInbox();
    const id = window.setInterval(() => void fetchInbox(), 55_000);
    return () => window.clearInterval(id);
  }, [signedIn, fetchInbox]);

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

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this broadcast?")) return;
    setErr(null);
    try {
      const r = await fetch("/api/map/broadcast", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
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

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <section className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/25">
      <h3 className="text-base font-semibold tracking-tight text-indigo-950 dark:text-indigo-100">
        Area broadcasts (~5 mi)
      </h3>
      <p className="mt-1 text-xs leading-5 text-indigo-900/80 dark:text-indigo-200/85">
        Short messages go to everyone roughly within five miles of where you sent from (same radius as nearby pins)
        {canSendGlobalBroadcast ? ", unless you choose to broadcast to all map areas." : "."} The last{" "}
        {MAP_BROADCAST_RETENTION_HOURS} hours stay here; new ones also pop up as a floating <strong className="font-semibold">Vicinity broadcast</strong> alert when we have a
        recent position saved from the map. On the live site, messages need{" "}
        <strong className="font-semibold">Supabase</strong> (or Vercel KV) so they are not stored only on one server
        disk.
      </p>

      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-indigo-900 dark:text-indigo-200">
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
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      ) : null}

      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-indigo-200/60 bg-white/90 p-2 dark:border-indigo-900/40 dark:bg-zinc-950/60">
        {loading ? (
          <p className="px-2 py-3 text-xs text-indigo-700 dark:text-indigo-300">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="px-2 py-3 text-xs text-indigo-800/80 dark:text-indigo-200/80">No broadcasts in this area yet.</p>
        ) : (
          messages.map((m) => (
            <article
              key={m.id}
              className="rounded-md border border-indigo-100/80 bg-white px-2.5 py-2 text-sm dark:border-indigo-900/30 dark:bg-zinc-900/80"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                  {fmtTime(m.createdAt)}
                  {m.isGlobal ? (
                    <span className="ml-2 rounded bg-amber-100 px-1 py-0.5 text-amber-950 dark:bg-amber-900/50 dark:text-amber-100">
                      All areas
                    </span>
                  ) : null}
                  {m.isMine ? (
                    <span className="ml-2 rounded bg-indigo-100 px-1 py-0.5 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-100">
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
                      className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-900 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-100 dark:hover:bg-indigo-900/40"
                    >
                      Reply
                    </button>
                  ) : null}
                  {m.canDelete ? (
                    <button
                      type="button"
                      onClick={() => void onDelete(m.id)}
                      className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-800 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/55"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap leading-snug text-zinc-800 dark:text-zinc-200">{m.body}</p>
            </article>
          ))
        )}
      </div>

      {signedIn ? (
        <div className="mt-4 rounded-lg border border-indigo-200/50 bg-white/50 p-3 dark:border-indigo-900/40 dark:bg-zinc-950/50">
          <h4 className="text-xs font-semibold text-indigo-950 dark:text-indigo-100">
            Vicinity replies (direct messages)
          </h4>
          <p className="mt-1 text-[11px] leading-snug text-indigo-900/75 dark:text-indigo-200/80">
            If someone taps <strong className="font-semibold">Reply</strong> on a broadcast, you chat in a private thread.
            There is no email or push — open a thread below or watch for a <strong className="font-semibold">Vicinity message</strong>{" "}
            alert. <strong className="font-semibold">Delete</strong> removes the whole thread for both people.
          </p>
          {inboxRows.length === 0 ? (
            <p className="mt-2 text-[11px] text-indigo-800/60 dark:text-indigo-300/70">No DM threads yet.</p>
          ) : (
            <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
              {inboxRows.map((row) => (
                <li key={row.threadId} className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setChatContext(row.lastBody.trim().split(/\r?\n/)[0]?.slice(0, 120));
                      setChatPeerUid(row.peerUid);
                    }}
                    className="flex min-w-0 flex-1 flex-col rounded-md border border-indigo-100 bg-white px-2 py-2 text-left text-xs hover:bg-indigo-50/80 dark:border-indigo-900/35 dark:bg-zinc-900/70 dark:hover:bg-zinc-900"
                  >
                    <span className="font-mono text-[10px] text-indigo-700/80 dark:text-indigo-300/90">
                      {row.peerUid.length > 14 ? `${row.peerUid.slice(0, 14)}…` : row.peerUid}
                      {row.lastIsMine ? (
                        <span className="ml-2 font-sans font-normal text-zinc-500 dark:text-zinc-400">· You last</span>
                      ) : (
                        <span className="ml-2 font-sans font-semibold text-amber-700 dark:text-amber-400">· Awaiting you</span>
                      )}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-zinc-800 dark:text-zinc-200">{row.lastBody}</span>
                    <span className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">{fmtTime(row.lastAt)}</span>
                  </button>
                  <button
                    type="button"
                    disabled={deletingThreadId === row.threadId}
                    onClick={(e) => void onDeleteDmThread(row, e)}
                    className="shrink-0 self-stretch rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/55"
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
            <label className="flex cursor-pointer items-start gap-2 text-xs font-medium text-indigo-900 dark:text-indigo-200">
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
          <label className="block text-xs font-medium text-indigo-900 dark:text-indigo-200">
            {broadcastAllAreas && canSendGlobalBroadcast ? "Broadcast (all areas)" : "Broadcast to ~5 mi"}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Short heads-up for nearby boaters…"
              className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-indigo-500 dark:border-indigo-800 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
          <button
            type="submit"
            disabled={posting || !draft.trim()}
            className="h-9 rounded-lg bg-indigo-700 px-3 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            {posting ? "Sending…" : broadcastAllAreas && canSendGlobalBroadcast ? "Send to all areas" : "Send broadcast"}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-indigo-900/85 dark:text-indigo-200/80">
          Turn on <strong>Share my location on this map</strong> to send a broadcast from your current position.
        </p>
      )}

      {chatPeerUid ? (
        <VicinityChatDrawer
          open
          peerUid={chatPeerUid}
          contextLine={chatContext}
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
