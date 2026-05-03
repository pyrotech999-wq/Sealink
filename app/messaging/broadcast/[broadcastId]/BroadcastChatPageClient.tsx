"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LinkifiedPlainText } from "@/components/LinkifiedPlainText";
import { formatChatSenderLine } from "@/lib/format-chat-sender";
import { getLastKnownPosition } from "@/lib/map-last-known";

type Msg = {
  id: string;
  senderUid: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  senderDisplayName?: string | null;
  senderBoatName?: string | null;
};

type BroadcastRow = {
  id: string;
  authorUid: string;
  body: string;
};

function fmtMsgTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BroadcastChatPageClient({ broadcastId }: { broadcastId: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const [readLat, setReadLat] = useState<number | null>(null);
  const [readLng, setReadLng] = useState<number | null>(null);
  const [broadcast, setBroadcast] = useState<BroadcastRow | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [markingSeen, setMarkingSeen] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [authorFullName, setAuthorFullName] = useState<string | null>(null);
  const [authorBoatName, setAuthorBoatName] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    let lat = Number(sp.get("lat"));
    let lng = Number(sp.get("lng"));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setReadLat(lat);
      setReadLng(lng);
      return;
    }
    const g = getLastKnownPosition();
    if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
      setReadLat(g.lat);
      setReadLng(g.lng);
    } else {
      setReadLat(null);
      setReadLng(null);
    }
  }, [pathname, broadcastId]);

  useEffect(() => {
    if (readLat != null && readLng != null) return;
    const id = window.setInterval(() => {
      const g = getLastKnownPosition();
      if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
        setReadLat(g.lat);
        setReadLng(g.lng);
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [readLat, readLng]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const markSeen = useCallback(async () => {
    if (!broadcastId || readLat == null || readLng == null) return;
    setMarkingSeen(true);
    try {
      await fetch("/api/broadcast-replies/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ broadcastId, lat: readLat, lng: readLng }),
      });
    } catch {
      /* */
    } finally {
      setMarkingSeen(false);
    }
  }, [broadcastId, readLat, readLng]);

  const loadBroadcastMeta = useCallback(async () => {
    if (!broadcastId || readLat == null || readLng == null) return;
    try {
      const r = await fetch(
        `/api/map/broadcast?lat=${encodeURIComponent(String(readLat))}&lng=${encodeURIComponent(String(readLng))}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const d = (await r.json()) as { messages?: BroadcastRow[] };
      const msgs = Array.isArray(d.messages) ? d.messages : [];
      setBroadcast(msgs.find((m) => m.id === broadcastId) ?? null);
    } catch {
      setBroadcast(null);
    }
  }, [broadcastId, readLat, readLng]);

  const loadMessages = useCallback(async () => {
    if (!broadcastId || readLat == null || readLng == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/broadcast-replies/messages?broadcastId=${encodeURIComponent(broadcastId)}&lat=${encodeURIComponent(String(readLat))}&lng=${encodeURIComponent(String(readLng))}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const d = (await r.json()) as { threadId?: string; messages?: Msg[]; error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Could not load chat");
        setMessages([]);
        return;
      }
      setMessages(Array.isArray(d.messages) ? d.messages : []);
    } catch {
      setErr("Network error");
      setMessages([]);
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [broadcastId, readLat, readLng]);

  useEffect(() => {
    setLoadedOnce(false);
  }, [broadcastId]);

  useEffect(() => {
    void loadBroadcastMeta();
  }, [loadBroadcastMeta]);

  useEffect(() => {
    const uid = broadcast?.authorUid?.trim();
    if (!uid) {
      setAuthorFullName(null);
      setAuthorBoatName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`/api/profiles/display?uid=${encodeURIComponent(uid)}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const d = (await r.json()) as { fullName?: string | null; boatName?: string | null };
        if (cancelled) return;
        setAuthorFullName(typeof d.fullName === "string" && d.fullName ? d.fullName : null);
        setAuthorBoatName(typeof d.boatName === "string" && d.boatName ? d.boatName : null);
      } catch {
        if (!cancelled) {
          setAuthorFullName(null);
          setAuthorBoatName(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [broadcast?.authorUid]);

  useEffect(() => {
    if (readLat == null || readLng == null) return;
    void loadMessages();
    const id = window.setInterval(() => void loadMessages(), 12_000);
    return () => window.clearInterval(id);
  }, [readLat, readLng, loadMessages]);

  useLayoutEffect(() => {
    if (messages.length === 0) return;
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const onSend = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const text = draft.trim();
    if (!text || readLat == null || readLng == null) return;
    setSending(true);
    setErr(null);
    try {
      const r = await fetch("/api/broadcast-replies/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ broadcastId, text, lat: readLat, lng: readLng }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Send failed");
        return;
      }
      setDraft("");
      await loadMessages();
    } catch {
      setErr("Network error");
    } finally {
      setSending(false);
    }
  };

  if (!broadcastId) {
    return <p className="mx-auto max-w-lg px-4 py-8 text-zinc-400">Missing broadcast id.</p>;
  }

  if (readLat == null || readLng == null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-zinc-300">Turn on location on the home map first, or open this link from the alert bar while location is recent.</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-green-400 underline">
          Home map
        </Link>
      </div>
    );
  }

  const authorLine =
    broadcast?.authorUid == null
      ? "—"
      : formatChatSenderLine(false, broadcast.authorUid, authorFullName, authorBoatName);

  const senderLabel = (m: Msg) =>
    formatChatSenderLine(m.isMine, m.senderUid, m.senderDisplayName, m.senderBoatName);

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col bg-zinc-950">
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-900/90 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.push("/messaging")}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            ← Back
          </button>
          <button
            type="button"
            disabled={markingSeen}
            onClick={() => void markSeen()}
            className="rounded-lg border border-emerald-700 bg-emerald-950/60 px-3 py-1.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/50 disabled:opacity-50"
          >
            {markingSeen ? "…" : "Seen"}
          </button>
        </div>
        <div className="mx-auto mt-2 max-w-2xl">
          <h1 className="text-lg font-bold text-indigo-100">Area broadcast chat</h1>
          <p className="text-xs text-zinc-400">
            Original poster <span className="font-medium text-zinc-200">{authorLine}</span> — everyone who could see the
            post can read and reply.
          </p>
        </div>
      </header>

      {broadcast?.body ? (
        <div className="shrink-0 border-b border-amber-900/40 bg-amber-950/30 px-3 py-3 sm:px-4">
          <p className="mx-auto max-w-2xl text-[10px] font-bold uppercase tracking-wider text-amber-200/90">Original message</p>
          <div className="sealink-thread-scroll mx-auto mt-1 max-h-40 max-w-2xl overflow-y-auto whitespace-pre-wrap text-sm text-amber-50">
            <LinkifiedPlainText text={broadcast.body} />
          </div>
        </div>
      ) : null}

      <div ref={scrollRef} className="sealink-thread-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4">
        {readLat != null &&
        readLng != null &&
        messages.length === 0 &&
        !err &&
        (!loadedOnce || loading) ? (
          <p className="text-center text-zinc-500">Loading…</p>
        ) : null}
        {err ? (
          <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">{err}</p>
        ) : null}
        {loadedOnce && !loading && messages.length === 0 && !err ? (
          <p className="rounded-lg border border-dashed border-zinc-700 px-3 py-8 text-center text-zinc-400">No replies yet.</p>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={`mx-auto flex max-w-2xl flex-col ${m.isMine ? "items-end" : "items-start"}`}>
            <span className="mb-0.5 px-1 text-[10px] font-semibold text-zinc-400">{senderLabel(m)}</span>
            <div
              className={`max-w-[88%] rounded-2xl px-3 py-2.5 text-base leading-relaxed shadow-sm sm:text-lg ${
                m.isMine
                  ? "rounded-br-md bg-indigo-600 text-white"
                  : "rounded-bl-md border border-zinc-600 bg-zinc-800 text-zinc-50"
              }`}
            >
              <div className="whitespace-pre-wrap break-words">
                <LinkifiedPlainText text={m.body} />
              </div>
              <p className={`mt-1.5 text-xs opacity-80 ${m.isMine ? "text-indigo-100" : "text-zinc-400"}`}>{fmtMsgTime(m.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => void onSend(e)}
        className="shrink-0 border-t border-zinc-800 bg-zinc-900 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Type a reply…"
            className="w-full resize-y rounded-xl border border-zinc-600 bg-zinc-950 px-3 py-2 text-base text-zinc-50 outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="h-12 rounded-xl bg-indigo-600 text-base font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
