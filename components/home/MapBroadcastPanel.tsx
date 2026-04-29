"use client";

import { useCallback, useEffect, useState } from "react";
import { useBroadcastToast } from "@/components/BroadcastToastProvider";
import { MAP_BROADCAST_RETENTION_HOURS } from "@/lib/map-broadcast-constants";

const WATERLINE_KEY = "sealink_broadcast_toast_waterline_v1";

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

export type BroadcastMsg = {
  id: string;
  body: string;
  createdAt: string;
  isMine: boolean;
};

type Props = {
  readLat: number;
  readLng: number;
  canSend: boolean;
  sendLat: number | null;
  sendLng: number | null;
};

export function MapBroadcastPanel({ readLat, readLng, canSend, sendLat, sendLng }: Props) {
  const toast = useBroadcastToast();
  const [messages, setMessages] = useState<BroadcastMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/map/broadcast?lat=${encodeURIComponent(String(readLat))}&lng=${encodeURIComponent(String(readLng))}`,
      );
      const d = (await r.json()) as { messages?: BroadcastMsg[]; error?: string };
      if (!r.ok) {
        setErr(d.error || "Could not load broadcasts");
        setMessages([]);
        return;
      }
      const msgs = Array.isArray(d.messages) ? d.messages : [];
      setMessages(msgs);

      const newest = msgs[0]?.createdAt;
      if (!newest) return;

      const wl = readWaterline();
      if (wl == null) {
        writeWaterline(newest);
        return;
      }

      if (toast) {
        for (const m of msgs) {
          if (new Date(m.createdAt) <= new Date(wl)) break;
          if (!m.isMine) toast.pushToast(m.body);
        }
      }
      writeWaterline(newest);
    } catch {
      setErr("Network error");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [readLat, readLng, toast]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 22_000);
    return () => window.clearInterval(id);
  }, [load]);

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
        body: JSON.stringify({ lat: sendLat, lng: sendLng, text }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error || "Could not send");
        return;
      }
      setDraft("");
      await load();
    } catch {
      setErr("Network error");
    } finally {
      setPosting(false);
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
        Short messages go to everyone roughly within five miles of where you sent from (same radius as nearby pins).
        The last {MAP_BROADCAST_RETENTION_HOURS} hours stay here; new ones also pop up as a banner across the app when
        we have a recent position saved from the map.
      </p>

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
              <p className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                {fmtTime(m.createdAt)}
                {m.isMine ? (
                  <span className="ml-2 rounded bg-indigo-100 px-1 py-0.5 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-100">
                    You
                  </span>
                ) : null}
              </p>
              <p className="mt-1 whitespace-pre-wrap leading-snug text-zinc-800 dark:text-zinc-200">{m.body}</p>
            </article>
          ))
        )}
      </div>

      {canSend && sendLat != null && sendLng != null ? (
        <form onSubmit={(e) => void onSend(e)} className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-indigo-900 dark:text-indigo-200">
            Broadcast to ~5 mi
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
            {posting ? "Sending…" : "Send broadcast"}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-indigo-900/85 dark:text-indigo-200/80">
          Turn on <strong>Share my location on this map</strong> to send a broadcast from your current position.
        </p>
      )}
    </section>
  );
}
