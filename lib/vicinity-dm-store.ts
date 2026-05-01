import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { canUseKv, kvGetJson, kvSetJson } from "@/lib/kv-json";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DATA_PATH = path.join(process.cwd(), "data", "vicinity-dm.json");
const KV_KEY = "sealink:vicinity-dm:v1";

export type VicinityDmMessagePublic = {
  id: string;
  senderUid: string;
  body: string;
  createdAt: string;
  isMine: boolean;
};

type ThreadRow = { id: string; userA: string; userB: string; createdAt: string };
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

function orderPair(a: string, b: string): { userA: string; userB: string } {
  if (a === b) throw new Error("SELF_DM");
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
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

async function ensureSupabaseThreadId(userA: string, userB: string): Promise<string> {
  const sb = supabaseAdmin();
  const { data: existing, error: findErr } = await sb
    .from("vicinity_dm_threads")
    .select("id")
    .eq("user_a", userA)
    .eq("user_b", userB)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  const exId = existing && typeof (existing as { id?: string }).id === "string" ? (existing as { id: string }).id : "";
  if (exId) return exId;

  const { data: ins, error: insErr } = await sb
    .from("vicinity_dm_threads")
    .insert({ user_a: userA, user_b: userB })
    .select("id")
    .single();
  if (!insErr && ins && typeof (ins as { id?: string }).id === "string") return (ins as { id: string }).id;

  if (insErr?.code === "23505") {
    const { data: again, error: aErr } = await sb
      .from("vicinity_dm_threads")
      .select("id")
      .eq("user_a", userA)
      .eq("user_b", userB)
      .single();
    if (!aErr && again && typeof (again as { id?: string }).id === "string") return (again as { id: string }).id;
  }
  throw new Error(insErr?.message ?? "Could not open chat thread.");
}

export async function listVicinityMessages(
  viewerUid: string,
  peerUid: string,
  limit = 120,
): Promise<{ threadId: string; messages: VicinityDmMessagePublic[] }> {
  return enqueue(async () => {
    const { userA, userB } = orderPair(viewerUid, peerUid);

    if (isSupabaseConfigured()) {
      const threadId = await ensureSupabaseThreadId(userA, userB);
      const sb = supabaseAdmin();
      const { data: rows, error: msgErr } = await sb
        .from("vicinity_dm_messages")
        .select("id, sender_uid, body, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (msgErr) throw new Error(msgErr.message);
      const chronological = [...(rows ?? [])].reverse();
      const messages: VicinityDmMessagePublic[] = chronological.map((r) => {
        const row = r as { id: string; sender_uid: string; body: string; created_at: string };
        return {
          id: row.id,
          senderUid: row.sender_uid,
          body: row.body,
          createdAt: row.created_at,
          isMine: row.sender_uid === viewerUid,
        };
      });
      return { threadId, messages };
    }

    const payload = await readPayload();
    let thread = payload.threads.find((t) => t.userA === userA && t.userB === userB);
    if (!thread) {
      thread = {
        id: randomUUID(),
        userA,
        userB,
        createdAt: new Date().toISOString(),
      };
      payload.threads.push(thread);
      await writePayload(payload);
    }

    const msgs = payload.messages
      .filter((m) => m.threadId === thread!.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-limit);
    const messages: VicinityDmMessagePublic[] = msgs.map((m) => ({
      id: m.id,
      senderUid: m.senderUid,
      body: m.body,
      createdAt: m.createdAt,
      isMine: m.senderUid === viewerUid,
    }));
    return { threadId: thread.id, messages };
  });
}

export async function appendVicinityMessage(
  viewerUid: string,
  peerUid: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return enqueue(async () => {
    const text = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (text.length < 1) return { ok: false, error: "Message cannot be empty." };
    if (text.length > 4000) return { ok: false, error: "Message too long." };

    try {
      const { userA, userB } = orderPair(viewerUid, peerUid);

      if (isSupabaseConfigured()) {
        const sb = supabaseAdmin();
        let threadId: string;
        try {
          threadId = await ensureSupabaseThreadId(userA, userB);
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : "Thread error" };
        }

        const { error: insMsg } = await sb.from("vicinity_dm_messages").insert({
          thread_id: threadId,
          sender_uid: viewerUid,
          body: text,
        });
        if (insMsg) return { ok: false, error: insMsg.message };
        return { ok: true };
      }

      const payload = await readPayload();
      let thread = payload.threads.find((t) => t.userA === userA && t.userB === userB);
      if (!thread) {
        thread = {
          id: randomUUID(),
          userA,
          userB,
          createdAt: new Date().toISOString(),
        };
        payload.threads.push(thread);
      }
      payload.messages.push({
        id: randomUUID(),
        threadId: thread.id,
        senderUid: viewerUid,
        body: text,
        createdAt: new Date().toISOString(),
      });
      await writePayload(payload);
      return { ok: true };
    } catch (e) {
      if (e instanceof Error && e.message === "SELF_DM") return { ok: false, error: "Invalid recipient." };
      throw e;
    }
  });
}
