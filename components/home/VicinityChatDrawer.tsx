"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type Msg = {
  id: string;
  senderUid: string;
  body: string;
  createdAt: string;
  isMine: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  peerUid: string;
  /** First line of the broadcast they replied to */
  contextLine?: string;
  /** Larger type on Messaging page. */
  textScale?: "default" | "readable";
};

export function VicinityChatDrawer({ open, onClose, peerUid, contextLine, textScale = "default" }: Props) {
  const R = textScale === "readable";
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const load = useCallback(async () => {
    if (!open || !peerUid) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/vicinity-chat/messages?peerUid=${encodeURIComponent(peerUid)}`);
      const d = (await r.json()) as { threadId?: string; messages?: Msg[]; error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Could not load chat");
        setMessages([]);
        setThreadId(null);
        return;
      }
      setMessages(Array.isArray(d.messages) ? d.messages : []);
      setThreadId(typeof d.threadId === "string" && d.threadId ? d.threadId : null);
    } catch {
      setErr("Network error");
      setMessages([]);
      setThreadId(null);
    } finally {
      setLoading(false);
    }
  }, [open, peerUid]);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setThreadId(null);
        setMessages([]);
      });
      return;
    }
    queueMicrotask(() => void load());
    const id = window.setInterval(() => queueMicrotask(() => void load()), 14_000);
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
    setSending(true);
    setErr(null);
    try {
      const r = await fetch("/api/vicinity-chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerUid, text }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Send failed");
        return;
      }
      setDraft("");
      await load();
      queueMicrotask(() => scrollToBottom());
    } catch {
      setErr("Network error");
    } finally {
      setSending(false);
    }
  };

  const onDeleteConversation = async () => {
    if (!threadId) return;
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

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close chat" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vicinity-chat-title"
        className={`relative flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-indigo-200 bg-white shadow-2xl dark:border-indigo-900/50 dark:bg-zinc-950 sm:rounded-2xl ${
          R ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="flex items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <h3
              id="vicinity-chat-title"
              className={`font-semibold text-zinc-900 dark:text-zinc-50 ${R ? "text-2xl sm:text-3xl" : "text-base"}`}
            >
              Direct message
            </h3>
            <p className={`mt-0.5 text-zinc-500 dark:text-zinc-400 ${R ? "text-lg" : "text-xs"}`}>
              Boater id{" "}
              <span className={`font-mono text-zinc-600 dark:text-zinc-300 ${R ? "text-lg" : "text-xs"}`} title={peerUid}>
                {peerUid.length > 14 ? `${peerUid.slice(0, 14)}…` : peerUid}
              </span>
            </p>
            {contextLine ? (
              <p
                className={`mt-1 line-clamp-2 font-medium text-zinc-700 dark:text-zinc-200 ${R ? "text-xl" : "text-xs"}`}
              >
                Re: {contextLine}
              </p>
            ) : null}
            <p className={`mt-1 leading-snug text-zinc-500 dark:text-zinc-400 ${R ? "text-lg" : "text-xs"}`}>
              About two messages show at once — scroll inside the list for the rest (newest at bottom). Seen closes this
              chat (messages stay); tap the thread row under Vicinity replies to reopen.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg border border-zinc-200 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900 ${
                R ? "px-3 py-2 text-lg" : "px-2 py-1 text-sm"
              }`}
            >
              Close
            </button>
            <button
              type="button"
              disabled={!threadId || deleting}
              onClick={() => void onDeleteConversation()}
              className={`rounded-lg border border-red-200 bg-red-50 font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/55 ${
                R ? "px-3 py-2 text-lg" : "px-2 py-1 text-sm"
              }`}
            >
              {deleting ? "Deleting…" : "Delete chat"}
            </button>
          </div>
        </div>

        <div className="overflow-hidden border-t border-zinc-200 dark:border-zinc-800">
          {messages.length > 2 && !loading ? (
            <p
              className={`border-b border-zinc-200 bg-zinc-50/80 px-2 py-1 text-center text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300 ${
                R ? "text-lg" : "text-xs"
              }`}
            >
              Newest at bottom — scroll up for earlier ({messages.length} in thread)
            </p>
          ) : null}
          <div
            ref={scrollRef}
            className={`min-h-[4.5rem] space-y-2 overflow-y-auto scroll-smooth px-3 py-2 ${
              R ? "max-h-[min(45vh,22rem)] sm:max-h-[min(50vh,26rem)]" : "max-h-[11rem] sm:max-h-[12rem]"
            }`}
          >
            {loading && messages.length === 0 ? (
              <p className={`text-zinc-500 ${R ? "text-xl" : "text-sm"}`}>Loading…</p>
            ) : null}
            {err ? (
              <p
                className={`rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 ${
                  R ? "text-xl" : "text-sm"
                }`}
              >
                {err}
              </p>
            ) : null}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[88%] rounded-xl px-2.5 py-2 leading-snug ${
                  R ? "px-3 py-3 text-3xl sm:text-4xl" : "text-base"
                } ${
                  m.isMine
                    ? "ml-auto bg-indigo-600 text-white"
                    : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`mt-1 opacity-70 ${R ? "text-lg" : "text-xs"}`}>
                  {new Date(m.createdAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={(e) => void onSend(e)} className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={R ? 3 : 2}
            maxLength={4000}
            placeholder="Write a message…"
            className={`w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 ${
              R ? "py-3 text-2xl sm:text-3xl" : "text-base"
            }`}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`shrink-0 rounded-lg border border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 ${
                R ? "h-12 px-4 text-lg" : "h-9 px-3 text-sm"
              }`}
            >
              Seen
            </button>
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className={`min-w-0 flex-1 rounded-lg bg-indigo-600 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-600 ${
                R ? "h-12 text-xl" : "h-9 text-base"
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
