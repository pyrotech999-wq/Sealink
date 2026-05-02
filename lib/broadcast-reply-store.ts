import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { canUseKv, kvGetJson, kvSetJson } from "@/lib/kv-json";
import { getBroadcastRowById, viewerMayAccessBroadcastReplyThread } from "@/lib/map-broadcast-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DATA_PATH = path.join(process.cwd(), "data", "broadcast-replies.json");
const KV_KEY = "sealink:broadcast-replies:v1";

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
  return enqueue(async () => {
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
    return { ok: true, threadId, messages };
  });
}

export async function appendBroadcastReplyMessage(
  viewerUid: string,
  broadcastId: string,
  viewerLat: number,
  viewerLng: number,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return enqueue(async () => {
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
  });
}
