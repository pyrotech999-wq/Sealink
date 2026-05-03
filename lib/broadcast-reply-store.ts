import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { canUseKv, kvGetJson, kvSetJson } from "@/lib/kv-json";
import {
  getBroadcastRowById,
  listBroadcastsNear,
  viewerMayAccessBroadcastReplyThread,
} from "@/lib/map-broadcast-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DATA_PATH = path.join(process.cwd(), "data", "broadcast-replies.json");
const KV_KEY = "sealink:broadcast-replies:v1";
const SEEN_DATA_PATH = path.join(process.cwd(), "data", "broadcast-reply-seen.json");
const SEEN_KV_KEY = "sealink:broadcast-reply-seen:v1";

export type BroadcastReplyMessagePublic = {
  id: string;
  senderUid: string;
  body: string;
  createdAt: string;
  isMine: boolean;
};

type ThreadRow = { id: string; broadcastId: string; createdAt: string };
type MessageRow = { id: string; threadId: string; senderUid: string; body: string; createdAt: string };
type FilePayload = { threads: ThreadRow[]; messages: MessageRow[] };

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function readFilePayload(): FilePayload {
  try {
    if (!existsSync(DATA_PATH)) return { threads: [], messages: [] };
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { threads: [], messages: [] };
    const p = parsed as Partial<FilePayload>;
    return {
      threads: Array.isArray(p.threads) ? p.threads : [],
      messages: Array.isArray(p.messages) ? p.messages : [],
    };
  } catch {
    return { threads: [], messages: [] };
  }
}

function writeFilePayload(p: FilePayload): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(p, null, 2), "utf-8");
}

async function readPayload(): Promise<FilePayload> {
  if (canUseKv()) {
    const raw = await kvGetJson<FilePayload | null>(KV_KEY, null);
    if (raw && typeof raw === "object" && Array.isArray(raw.threads) && Array.isArray(raw.messages)) return raw;
    return { threads: [], messages: [] };
  }
  return readFilePayload();
}

async function writePayload(p: FilePayload): Promise<void> {
  if (canUseKv()) await kvSetJson(KV_KEY, p);
  else writeFilePayload(p);
}

async function ensureSupabaseThreadId(broadcastId: string): Promise<string> {
  const sb = supabaseAdmin();
  const { data: existing, error: findErr } = await sb
    .from("broadcast_reply_threads")
    .select("id")
    .eq("broadcast_id", broadcastId)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  const exId = existing && typeof (existing as { id?: string }).id === "string" ? (existing as { id: string }).id : "";
  if (exId) return exId;

  const { data: ins, error: insErr } = await sb
    .from("broadcast_reply_threads")
    .insert({ broadcast_id: broadcastId })
    .select("id")
    .single();
  if (!insErr && ins && typeof (ins as { id?: string }).id === "string") return (ins as { id: string }).id;

  if (insErr?.code === "23505") {
    const { data: again, error: aErr } = await sb
      .from("broadcast_reply_threads")
      .select("id")
      .eq("broadcast_id", broadcastId)
      .single();
    if (!aErr && again && typeof (again as { id?: string }).id === "string") return (again as { id: string }).id;
  }
  throw new Error(insErr?.message ?? "Could not open broadcast reply thread.");
}

async function ensureFileThreadId(broadcastId: string): Promise<string> {
  const payload = await readPayload();
  let t = payload.threads.find((x) => x.broadcastId === broadcastId);
  if (!t) {
    t = {
      id: randomUUID(),
      broadcastId,
      createdAt: new Date().toISOString(),
    };
    payload.threads.push(t);
    await writePayload(payload);
  }
  return t.id;
}

export async function listBroadcastReplyMessages(
  viewerUid: string,
  broadcastId: string,
  viewerLat: number,
  viewerLng: number,
  limit = 200,
): Promise<{ ok: true; threadId: string; messages: BroadcastReplyMessagePublic[] } | { ok: false; error: string }> {
  /** Reads must not sit behind the global file/KV write queue (alerts / other appends), or the UI hangs on “Loading…”. */
  const m = await getBroadcastRowById(broadcastId);
  if (!m) return { ok: false, error: "Broadcast not found or no longer available." };
  if (!(await viewerMayAccessBroadcastReplyThread(m, viewerUid, viewerLat, viewerLng))) {
    return { ok: false, error: "You cannot access replies for this broadcast from here." };
  }

  if (isSupabaseConfigured()) {
    let threadId: string;
    try {
      threadId = await ensureSupabaseThreadId(broadcastId);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Thread error" };
    }
    const sb = supabaseAdmin();
    const { data: rows, error: msgErr } = await sb
      .from("broadcast_reply_messages")
      .select("id, sender_uid, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (msgErr) return { ok: false, error: msgErr.message };
    const chronological = [...(rows ?? [])].reverse();
    const messages: BroadcastReplyMessagePublic[] = chronological.map((r) => {
      const row = r as { id: string; sender_uid: string; body: string; created_at: string };
      return {
        id: row.id,
        senderUid: row.sender_uid,
        body: row.body,
        createdAt: row.created_at,
        isMine: row.sender_uid === viewerUid,
      };
    });
    return { ok: true, threadId, messages };
  }

  return enqueue(async () => {
    const threadId = await ensureFileThreadId(broadcastId);
    const payload = await readPayload();
    const msgs = payload.messages
      .filter((x) => x.threadId === threadId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-limit);
    const messages: BroadcastReplyMessagePublic[] = msgs.map((row) => ({
      id: row.id,
      senderUid: row.senderUid,
      body: row.body,
      createdAt: row.createdAt,
      isMine: row.senderUid === viewerUid,
    }));
    return { ok: true as const, threadId, messages };
  });
}

async function appendBroadcastReplyMessageFile(
  viewerUid: string,
  broadcastId: string,
  viewerLat: number,
  viewerLng: number,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await getBroadcastRowById(broadcastId);
  if (!m) return { ok: false, error: "Broadcast not found or no longer available." };
  if (!(await viewerMayAccessBroadcastReplyThread(m, viewerUid, viewerLat, viewerLng))) {
    return { ok: false, error: "You cannot post here from this location or account." };
  }
  const threadId = await ensureFileThreadId(broadcastId);
  const payload = await readPayload();
  payload.messages.push({
    id: randomUUID(),
    threadId,
    senderUid: viewerUid,
    body: text,
    createdAt: new Date().toISOString(),
  });
  await writePayload(payload);
  return { ok: true };
}

export async function appendBroadcastReplyMessage(
  viewerUid: string,
  broadcastId: string,
  viewerLat: number,
  viewerLng: number,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (text.length < 1) return { ok: false, error: "Message cannot be empty." };
  if (text.length > 4000) return { ok: false, error: "Message too long." };

  const m = await getBroadcastRowById(broadcastId);
  if (!m) return { ok: false, error: "Broadcast not found or no longer available." };
  if (!(await viewerMayAccessBroadcastReplyThread(m, viewerUid, viewerLat, viewerLng))) {
    return { ok: false, error: "You cannot post here from this location or account." };
  }

  if (isSupabaseConfigured()) {
    let threadId: string;
    try {
      threadId = await ensureSupabaseThreadId(broadcastId);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Thread error" };
    }
    const sb = supabaseAdmin();
    const { error: insMsg } = await sb.from("broadcast_reply_messages").insert({
      thread_id: threadId,
      sender_uid: viewerUid,
      body: text,
    });
    if (insMsg) return { ok: false, error: insMsg.message };
    return { ok: true };
  }

  return enqueue(() => appendBroadcastReplyMessageFile(viewerUid, broadcastId, viewerLat, viewerLng, text));
}

export type BroadcastReplyAlert = {
  broadcastId: string;
  authorUid: string;
  lastMessageId: string;
  lastMessageAt: string;
  snippet: string;
};

type SeenRow = { viewerUid: string; broadcastId: string; lastSeenAt: string };
type SeenPayload = { rows: SeenRow[] };

function readSeenFile(): SeenPayload {
  try {
    if (!existsSync(SEEN_DATA_PATH)) return { rows: [] };
    const raw = readFileSync(SEEN_DATA_PATH, "utf-8");
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return { rows: [] };
    const rows = Array.isArray((p as SeenPayload).rows) ? (p as SeenPayload).rows : [];
    return { rows: rows.filter((r) => r && typeof r.viewerUid === "string" && typeof r.broadcastId === "string" && typeof r.lastSeenAt === "string") };
  } catch {
    return { rows: [] };
  }
}

function writeSeenFile(p: SeenPayload): void {
  mkdirSync(path.dirname(SEEN_DATA_PATH), { recursive: true });
  writeFileSync(SEEN_DATA_PATH, JSON.stringify(p, null, 2), "utf-8");
}

async function readSeenPayload(): Promise<SeenPayload> {
  if (canUseKv()) {
    const raw = await kvGetJson<SeenPayload | null>(SEEN_KV_KEY, null);
    if (raw && typeof raw === "object" && Array.isArray(raw.rows)) return raw;
    return { rows: [] };
  }
  return readSeenFile();
}

async function writeSeenPayload(p: SeenPayload): Promise<void> {
  if (canUseKv()) await kvSetJson(SEEN_KV_KEY, p);
  else writeSeenFile(p);
}

async function getSeenLastAt(viewerUid: string, broadcastId: string): Promise<string | null> {
  const bid = broadcastId.trim();
  if (!bid) return null;
  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("broadcast_reply_seen")
      .select("last_seen_at")
      .eq("viewer_uid", viewerUid)
      .eq("broadcast_id", bid)
      .maybeSingle();
    if (error) return null;
    const iso = data && typeof (data as { last_seen_at?: string }).last_seen_at === "string" ? (data as { last_seen_at: string }).last_seen_at : "";
    return iso || null;
  }
  const p = await readSeenPayload();
  const hit = p.rows.find((r) => r.viewerUid === viewerUid && r.broadcastId === bid);
  return hit?.lastSeenAt ?? null;
}

async function upsertSeenLastAt(viewerUid: string, broadcastId: string, lastSeenAt: string): Promise<void> {
  const bid = broadcastId.trim();
  if (!bid) return;
  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    await sb.from("broadcast_reply_seen").upsert(
      { viewer_uid: viewerUid, broadcast_id: bid, last_seen_at: lastSeenAt },
      { onConflict: "viewer_uid,broadcast_id" },
    );
    return;
  }
  const p = await readSeenPayload();
  const next = p.rows.filter((r) => !(r.viewerUid === viewerUid && r.broadcastId === bid));
  next.push({ viewerUid, broadcastId: bid, lastSeenAt });
  await writeSeenPayload({ rows: next });
}

/** Latest reply in the shared thread for this area broadcast, if any. */
export async function getLatestBroadcastReplyMessage(
  broadcastId: string,
): Promise<{ id: string; createdAt: string; body: string; senderUid: string } | null> {
  return enqueue(async () => {
    const bid = broadcastId.trim();
    if (!bid) return null;
    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { data: thread, error: tErr } = await sb
        .from("broadcast_reply_threads")
        .select("id")
        .eq("broadcast_id", bid)
        .maybeSingle();
      if (tErr || !thread || typeof (thread as { id?: string }).id !== "string") return null;
      const tid = (thread as { id: string }).id;
      const { data: row, error: mErr } = await sb
        .from("broadcast_reply_messages")
        .select("id, sender_uid, body, created_at")
        .eq("thread_id", tid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mErr || !row) return null;
      const r = row as { id: string; sender_uid: string; body: string; created_at: string };
      return { id: r.id, createdAt: r.created_at, body: r.body, senderUid: r.sender_uid };
    }
    const payload = await readPayload();
    const thread = payload.threads.find((x) => x.broadcastId === bid);
    if (!thread) return null;
    const msgs = payload.messages
      .filter((x) => x.threadId === thread.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const last = msgs[msgs.length - 1];
    if (!last) return null;
    return { id: last.id, createdAt: last.createdAt, body: last.body, senderUid: last.senderUid };
  });
}

/**
 * Threads with reply activity newer than this viewer's last seen time (after first bootstrap per thread).
 */
export async function listUnreadBroadcastReplyAlerts(
  viewerUid: string,
  viewerLat: number,
  viewerLng: number,
  viewerIsAdmin = false,
): Promise<BroadcastReplyAlert[]> {
  return enqueue(async () => {
    const visible = await listBroadcastsNear(viewerLat, viewerLng, viewerUid, viewerIsAdmin);
    const alerts: BroadcastReplyAlert[] = [];
    for (const m of visible) {
      const latest = await getLatestBroadcastReplyMessage(m.id);
      if (!latest) continue;
      const seen = await getSeenLastAt(viewerUid, m.id);
      if (!seen) {
        await upsertSeenLastAt(viewerUid, m.id, latest.createdAt);
        continue;
      }
      if (new Date(latest.createdAt).getTime() > new Date(seen).getTime()) {
        const snip = latest.body.replace(/\s+/g, " ").trim().slice(0, 120);
        alerts.push({
          broadcastId: m.id,
          authorUid: m.authorUid,
          lastMessageId: latest.id,
          lastMessageAt: latest.createdAt,
          snippet: snip,
        });
      }
    }
    alerts.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
    return alerts;
  });
}

export async function markBroadcastReplyThreadSeen(
  viewerUid: string,
  broadcastId: string,
  viewerLat: number,
  viewerLng: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return enqueue(async () => {
    const row = await getBroadcastRowById(broadcastId);
    if (!row) return { ok: false, error: "Broadcast not found or no longer available." };
    if (!(await viewerMayAccessBroadcastReplyThread(row, viewerUid, viewerLat, viewerLng))) {
      return { ok: false, error: "You cannot update read state for this thread from here." };
    }
    const latest = await getLatestBroadcastReplyMessage(broadcastId);
    const iso = latest?.createdAt ?? new Date().toISOString();
    await upsertSeenLastAt(viewerUid, broadcastId, iso);
    return { ok: true };
  });
}
