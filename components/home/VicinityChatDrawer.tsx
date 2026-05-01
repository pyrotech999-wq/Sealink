"use client";

import { useCallback, useEffect, useState } from "react";

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
};

export function VicinityChatDrawer({ open, onClose, peerUid, contextLine }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

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
      setThreadId(null);
      setMessages([]);
      return;
    }
    void load();
    const id = window.setInterval(() => void load(), 14_000);
    return () => window.clearInterval(id);
  }, [open, load]);

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
        className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl border border-indigo-200 bg-white shadow-2xl dark:border-indigo-900/50 dark:bg-zinc-950 sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <h3 id="vicinity-chat-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Direct message
            </h3>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              Boater id{" "}
              <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-300" title={peerUid}>
                {peerUid.length > 14 ? `${peerUid.slice(0, 14)}…` : peerUid}
              </span>
            </p>
            {contextLine ? (
              <p className="mt-1 line-clamp-2 text-[11px] text-zinc-600 dark:text-zinc-300">Re: {contextLine}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!threadId || deleting}
              onClick={() => void onDeleteConversation()}
              className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/55"
            >
              {deleting ? "Deleting…" : "Delete chat"}
            </button>
          </div>
        </div>

        <div className="min-h-[220px] flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {loading && messages.length === 0 ? <p className="text-xs text-zinc-500">Loading…</p> : null}
          {err ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {err}
            </p>
          ) : null}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[88%] rounded-xl px-2.5 py-2 text-sm leading-snug ${
                m.isMine
                  ? "ml-auto bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-1 text-[9px] opacity-70">
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

        <form onSubmit={(e) => void onSend(e)} className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="Write a message…"
            className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="mt-2 h-9 w-full rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-600"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
