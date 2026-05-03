"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LinkifiedPlainText } from "@/components/LinkifiedPlainText";
import { formatChatSenderLine } from "@/lib/format-chat-sender";

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
  /** Other party (private DM) or original broadcast author uid (for display when using broadcast replies). */
  peerUid: string;
  /** When set, shared thread for this area broadcast — anyone who could see the original can read and post. */
  broadcastId?: string | null;
  /** Viewer position for server-side access checks (same as map / messaging reads). */
  readLat: number;
  readLng: number;
  /** Short preview (e.g. first line) for subtitle / fallback. */
  contextLine?: string;
  /** Full area-broadcast text when chat was opened via Reply (shown at top of thread). */
  broadcastBody?: string | null;
  /** Larger type on Messaging page. */
  textScale?: "default" | "readable";
};

function fmtMsgTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VicinityChatDrawer({
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
  const R = textScale === "readable";
  const isBroadcastThread = Boolean(broadcastId?.trim());
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const focusComposer = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus({ preventScroll: false });
    ta.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!open) return;
    const silent = opts?.silent === true;
    const brId = broadcastId?.trim() ?? "";
    if (!silent) {
      setLoading(true);
      setErr(null);
    }
    if (brId) {
      if (!Number.isFinite(readLat) || !Number.isFinite(readLng)) {
        setErr("Location needed to load broadcast replies.");
        setMessages([]);
        setThreadId(null);
        setLoading(false);
        return;
      }
    } else if (!peerUid) {
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    const to = window.setTimeout(() => ac.abort(), 28_000);
    try {
      const r = brId
        ? await fetch(
            `/api/broadcast-replies/messages?broadcastId=${encodeURIComponent(brId)}&lat=${encodeURIComponent(String(readLat))}&lng=${encodeURIComponent(String(readLng))}`,
            { credentials: "same-origin", cache: "no-store", signal: ac.signal },
          )
        : await fetch(`/api/vicinity-chat/messages?peerUid=${encodeURIComponent(peerUid)}`, {
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
  }, [open, peerUid, broadcastId, readLat, readLng]);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setThreadId(null);
        setMessages([]);
      });
      return;
    }
    queueMicrotask(() => void load());
    const id = window.setInterval(() => queueMicrotask(() => void load({ silent: true })), 14_000);
    return () => window.clearInterval(id);
  }, [open, load]);

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

  const peerShort = peerUid.length > 22 ? `${peerUid.slice(0, 22)}…` : peerUid;
  const senderLabel = (m: Msg) =>
    formatChatSenderLine(m.isMine, m.senderUid, m.senderDisplayName, m.senderBoatName);
  const bubbleText = R ? "text-lg leading-relaxed sm:text-xl" : "text-sm leading-relaxed";
  const metaText = R ? "text-sm" : "text-[11px]";

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-label="Close chat" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vicinity-chat-title"
        className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-indigo-200/90 bg-zinc-50 shadow-2xl dark:border-indigo-900/60 dark:bg-zinc-950 sm:rounded-2xl ${
          R ? "max-w-2xl" : "max-w-md"
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="min-w-0">
            <h3
              id="vicinity-chat-title"
              className={`font-bold tracking-tight text-indigo-950 dark:text-indigo-100 ${R ? "text-xl sm:text-2xl" : "text-base"}`}
            >
              {isBroadcastThread ? "Broadcast replies" : "Private chat"}
            </h3>
            <p className={`mt-0.5 text-zinc-600 dark:text-zinc-400 ${R ? "text-sm" : "text-xs"}`}>
              {isBroadcastThread ? (
                <>
                  Original poster{" "}
                  <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200" title={peerUid}>
                    {peerShort}
                  </span>
                </>
              ) : (
                <>
                  With{" "}
                  <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200" title={peerUid}>
                    {peerShort}
                  </span>
                </>
              )}
            </p>
            <p className={`mt-1 text-zinc-500 dark:text-zinc-400 ${R ? "text-sm" : "text-[11px] leading-snug"}`}>
              {isBroadcastThread
                ? "Everyone who could see the original area broadcast can read and reply here — same friends / distance rules as the post."
                : "Only the two of you can read this thread. Your messages and theirs stay together here."}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg border border-zinc-200 bg-white font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 ${
                R ? "px-3 py-2 text-sm" : "px-2.5 py-1.5 text-xs"
              }`}
            >
              Done
            </button>
            {!isBroadcastThread ? (
              <button
                type="button"
                disabled={!threadId || deleting}
                onClick={() => void onDeleteConversation()}
                className={`rounded-lg border border-red-200 bg-red-50 font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/55 ${
                  R ? "px-3 py-2 text-sm" : "px-2 py-1 text-xs"
                }`}
              >
                {deleting ? "Deleting…" : "Delete chat"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Thread */}
        <div className="flex min-h-0 flex-1 flex-col border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950/80">
          <div
            ref={scrollRef}
            className={`sealink-thread-scroll min-h-0 flex-1 space-y-3 overflow-y-auto scroll-smooth py-3 pl-3 pr-2 sm:px-4 sm:pr-3 ${
              R ? "max-h-[min(52vh,26rem)] sm:max-h-[min(56vh,28rem)]" : "max-h-[min(48vh,20rem)] sm:max-h-[min(50vh,22rem)]"
            }`}
          >
            {broadcastBody && broadcastBody.trim().length > 0 ? (
              <div className="rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-orange-50/80 p-3 shadow-sm dark:border-amber-900/40 dark:from-amber-950/50 dark:to-orange-950/30 sm:p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-900/80 dark:text-amber-200/90">
                  Original area broadcast
                </p>
                <div
                  className={`sealink-thread-scroll mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap pr-1 text-zinc-900 dark:text-zinc-100 ${R ? "text-base" : "text-xs"}`}
                >
                  <LinkifiedPlainText text={broadcastBody} />
                </div>
              </div>
            ) : contextLine ? (
              <div className="rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/80">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Thread</p>
                <p className={`mt-1 line-clamp-3 text-zinc-800 dark:text-zinc-200 ${R ? "text-sm" : "text-xs"}`}>{contextLine}</p>
              </div>
            ) : null}

            {loading && messages.length === 0 ? (
              <p className={`text-center text-zinc-500 ${R ? "text-base" : "text-sm"}`}>Loading messages…</p>
            ) : null}
            {err ? (
              <p
                className={`rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 ${
                  R ? "text-base" : "text-sm"
                }`}
              >
                {err}
              </p>
            ) : null}

            {!loading && messages.length === 0 && !err ? (
              <p className={`rounded-lg border border-dashed border-zinc-300 bg-white/60 px-3 py-6 text-center text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-400 ${R ? "text-base" : "text-sm"}`}>
                No messages yet — say hello below.
              </p>
            ) : null}

            {messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.isMine ? "items-end" : "items-start"}`}>
                <span
                  className={`mb-0.5 px-1 font-semibold text-zinc-600 dark:text-zinc-300 ${R ? "text-xs" : "text-[10px]"}`}
                >
                  {senderLabel(m)}
                </span>
                <div
                  className={`max-w-[92%] rounded-2xl px-3 py-2.5 shadow-sm ${bubbleText} ${
                    m.isMine
                      ? "rounded-br-md bg-indigo-600 text-white"
                      : "rounded-bl-md border border-zinc-200/80 bg-white text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">
                    <LinkifiedPlainText text={m.body} />
                  </div>
                  <p className={`mt-1.5 opacity-75 ${m.isMine ? "text-indigo-100" : "text-zinc-500 dark:text-zinc-400"} ${metaText}`}>
                    {fmtMsgTime(m.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Composer */}
        <form onSubmit={(e) => void onSend(e)} className="shrink-0 space-y-2 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:p-4">
          <label htmlFor="vicinity-chat-draft" className="sr-only">
            Your message
          </label>
          <textarea
            id="vicinity-chat-draft"
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={R ? 3 : 2}
            maxLength={4000}
            placeholder="Type your reply…"
            className={`w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-900 shadow-inner outline-none ring-indigo-500/0 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 ${
              R ? "min-h-[5.5rem] text-lg sm:text-xl" : "min-h-[4.5rem] text-sm"
            }`}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => focusComposer()}
              className={`shrink-0 rounded-xl border-2 border-indigo-200 bg-indigo-50 font-semibold text-indigo-900 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-100 dark:hover:bg-indigo-900/40 ${
                R ? "h-11 px-4 text-base" : "h-10 px-3 text-sm"
              }`}
            >
              Reply
            </button>
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className={`min-w-0 flex-1 rounded-xl bg-indigo-600 font-bold text-white shadow-md hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500 ${
                R ? "h-11 text-base" : "h-10 text-sm"
              }`}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
