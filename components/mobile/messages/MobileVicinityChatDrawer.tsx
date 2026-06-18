"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LinkifiedPlainText } from "@/components/LinkifiedPlainText";
import { formatChatSenderLine } from "@/lib/format-chat-sender";
import { getMessagePollDelayMs } from "@/lib/message-poll-delays";
import { X, Trash2, Send } from "lucide-react";

type Msg = {
  id: string;
  senderUid: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  senderDisplayName?: string | null;
  senderBoatName?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  peerUid: string;
  broadcastId?: string | null;
  readLat: number;
  readLng: number;
  contextLine?: string;
  broadcastBody?: string | null;
  textScale?: "default" | "readable";
};

function fmtMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MobileVicinityChatDrawer({
  open,
  onClose,
  peerUid,
  broadcastId = null,
  readLat,
  readLng,
  contextLine,
  broadcastBody,
  textScale = "default",
}: Props) {
  const isBroadcastThread = Boolean(broadcastId?.trim());
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [peerName, setPeerName] = useState<string | null>(null);
  const [peerBoat, setPeerBoat] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const openRef = useRef(open);
  const peerUidRef = useRef(peerUid);
  const broadcastIdRef = useRef(broadcastId);
  const readLatRef = useRef(readLat);
  const readLngRef = useRef(readLng);
  openRef.current = open;
  peerUidRef.current = peerUid;
  broadcastIdRef.current = broadcastId;
  readLatRef.current = readLat;
  readLngRef.current = readLng;

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!openRef.current) return;
    const silent = opts?.silent === true;
    const brId = (broadcastIdRef.current ?? "").trim();
    const peer = peerUidRef.current;
    const lat = readLatRef.current;
    const lng = readLngRef.current;
    if (!silent) {
      setLoading(true);
      setErr(null);
    }
    if (brId) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setErr("Location needed to load broadcast replies.");
        setMessages([]);
        setThreadId(null);
        setLoading(false);
        return;
      }
    } else if (!peer) {
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    const to = window.setTimeout(() => ac.abort(), 28_000);
    try {
      const r = brId
        ? await fetch(
          `/api/broadcast-replies/messages?broadcastId=${encodeURIComponent(brId)}&lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
          { credentials: "same-origin", cache: "no-store", signal: ac.signal },
        )
        : await fetch(`/api/vicinity-chat/messages?peerUid=${encodeURIComponent(peer)}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: ac.signal,
        });
      let d: { threadId?: string; messages?: Msg[]; error?: string };
      try {
        d = (await r.json()) as { threadId?: string; messages?: Msg[]; error?: string };
      } catch {
        if (!silent) {
          setErr(r.ok ? "Invalid response from server." : `Could not load chat (${r.status})`);
          setMessages([]);
          setThreadId(null);
        }
        return;
      }
      if (!r.ok) {
        if (!silent) {
          setErr(d.error ?? "Could not load chat");
          setMessages([]);
          setThreadId(null);
        }
        return;
      }
      setMessages(Array.isArray(d.messages) ? d.messages : []);
      setThreadId(typeof d.threadId === "string" && d.threadId ? d.threadId : null);
    } catch (e) {
      if (!silent) {
        const aborted = e instanceof Error && e.name === "AbortError";
        setErr(aborted ? "Request timed out — try again." : "Network error");
        setMessages([]);
        setThreadId(null);
      }
    } finally {
      window.clearTimeout(to);
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setThreadId(null);
        setMessages([]);
        setPeerName(null);
        setPeerBoat(null);
      });
      return;
    }
    let cancelled = false;
    let tid: number | null = null;
    const scheduleAfter = (ms: number) => {
      if (cancelled) return;
      tid = window.setTimeout(loop, ms);
    };
    const loop = () => {
      if (cancelled) return;
      void load({ silent: true }).finally(() => {
        if (cancelled) return;
        scheduleAfter(getMessagePollDelayMs());
      });
    };
    queueMicrotask(() => void load());
    scheduleAfter(getMessagePollDelayMs());
    const onVis = () => {
      if (tid != null) {
        window.clearTimeout(tid);
        tid = null;
      }
      if (!cancelled) void load({ silent: true }).finally(() => !cancelled && scheduleAfter(getMessagePollDelayMs()));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (tid != null) window.clearTimeout(tid);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [open, peerUid, broadcastId, load]);

  useEffect(() => {
    if (!open) return;
    if (isBroadcastThread) return;
    const uid = peerUid.trim();
    if (!uid) return;
    const ac = new AbortController();
    const to = window.setTimeout(() => ac.abort(), 12_000);
    (async () => {
      try {
        const r = await fetch(`/api/profiles/display?uid=${encodeURIComponent(uid)}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: ac.signal,
        });
        const d = (await r.json()) as { fullName?: string | null; boatName?: string | null };
        if (!r.ok) return;
        setPeerName(typeof d.fullName === "string" && d.fullName.trim() ? d.fullName.trim() : null);
        setPeerBoat(typeof d.boatName === "string" && d.boatName.trim() ? d.boatName.trim() : null);
      } catch {
        /* ignore */
      } finally {
        window.clearTimeout(to);
      }
    })();
    return () => {
      window.clearTimeout(to);
      ac.abort();
    };
  }, [open, peerUid, isBroadcastThread]);

  useLayoutEffect(() => {
    if (!open || messages.length === 0) return;
    scrollToBottom();
  }, [open, messages, scrollToBottom]);

  const onSend = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const brId = broadcastId?.trim() ?? "";
    if (brId && (!Number.isFinite(readLat) || !Number.isFinite(readLng))) {
      setErr("Location needed to send.");
      return;
    }
    setSending(true);
    setErr(null);
    const ac = new AbortController();
    const to = window.setTimeout(() => ac.abort(), 28_000);
    try {
      const r = await fetch(brId ? "/api/broadcast-replies/messages" : "/api/vicinity-chat/messages", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify(
          brId
            ? { broadcastId: brId, text, lat: readLat, lng: readLng }
            : { peerUid, text },
        ),
      });

      let d: { error?: string };
      try {
        d = (await r.json()) as { error?: string };
      } catch {
        setErr(r.ok ? "Invalid response from server." : `Send failed (${r.status})`);
        return;
      }
      if (!r.ok) {
        setErr(d.error ?? "Send failed");
        return;
      }
      setDraft("");
      void load({ silent: true });
      queueMicrotask(() => scrollToBottom());
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      setErr(aborted ? "Send timed out — try again." : "Network error");
    } finally {
      window.clearTimeout(to);
      setSending(false);
    }
  };

  const onDeleteConversation = async () => {
    if (isBroadcastThread || !threadId) return;
    if (
      !window.confirm(
        "Delete this entire conversation? All messages are removed for you and the other boater.",
      )
    ) {
      return;
    }
    setDeleting(true);
    setErr(null);
    try {
      const r = await fetch("/api/vicinity-chat/thread", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Could not delete");
        return;
      }
      onClose();
    } catch {
      setErr("Network error");
    } finally {
      setDeleting(false);
    }
  };

  if (!open) return null;

  const peerShort = peerUid.length > 18 ? `${peerUid.slice(0, 18)}…` : peerUid;
  const peerLabel = peerName && peerBoat ? `${peerName} · ${peerBoat}` : peerName || peerBoat || null;
  const senderLabel = (m: Msg) =>
    formatChatSenderLine(m.isMine, m.senderUid, m.senderDisplayName, m.senderBoatName);

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/70 backdrop-blur-sm">
      {/* Tap backdrop to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Box */}
      <div className="relative flex h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-[32px] border-t border-white/[0.1] bg-gradient-to-b from-[#09152b] to-[#040a15] shadow-2xl animate-slide-up">
        {/* Swiper Handle */}
        <div className="mx-auto my-3.5 h-1.5 w-12 shrink-0 rounded-full bg-white/10" />

        {/* Header Section */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0c1a35]/60 px-5 py-3.5 backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-white tracking-tight">
                {isBroadcastThread ? "Broadcast Replies" : "Direct Comm Link"}
              </h3>
              <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            </div>

            <p className="mt-0.5 truncate text-[13px] font-bold text-cyan-400">
              {peerLabel ?? peerShort}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {!isBroadcastThread && threadId && (
              <button
                type="button"
                disabled={deleting}
                onClick={() => void onDeleteConversation()}
                className="flex items-center justify-center p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
                title="Delete Conversation"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center p-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-slate-300 hover:bg-white/[0.1] transition-all"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Info Strip */}
        <div className="bg-[#0b172a]/40 border-b border-white/[0.04] px-5 py-2 text-[10px] text-slate-400 tracking-wide">
          {isBroadcastThread
            ? "Public thread: replies are visible to nearby boaters in this area."
            : "Private connection: chat log is securely encrypted between you two."}
        </div>

        {/* Messages Feed Area */}
        <div className="flex min-h-0 flex-1 flex-col bg-[#050c18]/80">
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-5 py-4 scrollbar-hide"
          >
            {broadcastBody && broadcastBody.trim().length > 0 ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 mb-2 shadow-inner">
                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400">
                  Original area broadcast
                </span>
                <div className="mt-1.5 text-xs leading-relaxed text-slate-200">
                  <LinkifiedPlainText text={broadcastBody} />
                </div>
              </div>
            ) : contextLine ? (
              <div className="rounded-2xl border border-white/[0.06] bg-[#0c1a33]/60 px-4 py-3 mb-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Context</span>
                <p className="mt-1 text-xs text-slate-200 line-clamp-2">{contextLine}</p>
              </div>
            ) : null}

            {loading && messages.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                Acquiring secure message log...
              </div>
            ) : null}

            {err ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-xs text-red-400">
                {err}
              </div>
            ) : null}

            {!loading && messages.length === 0 && !err ? (
              <div className="py-12 text-center">
                <span className="text-2xl">💬</span>
                <p className="mt-2 text-xs text-slate-400 font-medium">No messages yet. Start the conversation!</p>
              </div>
            ) : null}

            {messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.isMine ? "items-end" : "items-start"}`}>
                {/* Author Name */}
                <span className="mb-1 text-[10px] font-bold tracking-wider uppercase text-slate-500 px-1">
                  {senderLabel(m)}
                </span>

                {/* Bubble */}
                <div
                  className={`max-w-[85%] rounded-[20px] px-4 py-2.5 shadow-xl text-[14px] leading-relaxed break-words whitespace-pre-wrap ${m.isMine
                    ? "rounded-tr-none bg-gradient-to-r from-blue-600 to-indigo-600 text-white border border-blue-500/25"
                    : "rounded-tl-none bg-gradient-to-b from-[#112139] to-[#071120] text-slate-100 border border-white/[0.05]"
                    }`}
                >
                  <LinkifiedPlainText text={m.body} />

                  <span
                    className={`mt-1.5 block text-[8.5px] font-semibold text-right ${m.isMine ? "text-blue-200/70" : "text-slate-400/80"
                      }`}
                  >
                    {fmtMsgTime(m.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Input Composer Panel */}
        <form
          onSubmit={(e) => void onSend(e)}
          className="shrink-0 border-t border-white/[0.06] bg-[#081328] p-4 flex flex-col gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="relative flex items-end gap-2.5">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              maxLength={4000}
              placeholder="Enter message link..."
              className="flex-1 max-h-24 min-h-[44px] rounded-2xl border border-white/[0.08] bg-[#0d1b33] px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSend(e);
                }
              }}
            />

            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-950/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
