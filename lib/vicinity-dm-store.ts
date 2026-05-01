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

export type VicinityInboxRow = {
  threadId: string;
  peerUid: string;
  lastMessageId: string;
  lastBody: string;
  lastAt: string;
  lastIsMine: boolean;
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

export async function listVicinityInbox(viewerUid: string, limit = 40): Promise<VicinityInboxRow[]> {
  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { data: threads, error: tErr } = await sb
        .from("vicinity_dm_threads")
        .select("id, user_a, user_b")
        .or(`user_a.eq.${viewerUid},user_b.eq.${viewerUid}`);
      if (tErr) throw new Error(tErr.message);
      if (!threads?.length) return [];

      const threadRows = threads as { id: string; user_a: string; user_b: string }[];
      const threadIds = threadRows.map((t) => t.id);
      const peerFor = new Map<string, string>();
      for (const t of threadRows) {
        peerFor.set(t.id, t.user_a === viewerUid ? t.user_b : t.user_a);
      }

      const { data: allMsgs, error: mErr } = await sb
        .from("vicinity_dm_messages")
        .select("id, thread_id, sender_uid, body, created_at")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false });
      if (mErr) throw new Error(mErr.message);

      const latestByThread = new Map<
        string,
        { id: string; thread_id: string; sender_uid: string; body: string; created_at: string }
      >();
      for (const raw of allMsgs ?? []) {
        const m = raw as {
          id: string;
          thread_id: string;
          sender_uid: string;
          body: string;
          created_at: string;
        };
        if (latestByThread.has(m.thread_id)) continue;
        latestByThread.set(m.thread_id, m);
      }

      const items: VicinityInboxRow[] = [];
      for (const tid of threadIds) {
        const last = latestByThread.get(tid);
        if (!last) continue;
        const peer = peerFor.get(tid);
        if (!peer) continue;
        items.push({
          threadId: tid,
          peerUid: peer,
          lastMessageId: last.id,
          lastBody: last.body,
          lastAt: last.created_at,
          lastIsMine: last.sender_uid === viewerUid,
        });
      }
      items.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
      return items.slice(0, limit);
    }

    const payload = await readPayload();
    const items: VicinityInboxRow[] = [];
    for (const t of payload.threads) {
      if (t.userA !== viewerUid && t.userB !== viewerUid) continue;
      const peer = t.userA === viewerUid ? t.userB : t.userA;
      const msgs = payload.messages
        .filter((m) => m.threadId === t.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const last = msgs[msgs.length - 1];
      if (!last) continue;
      items.push({
        threadId: t.id,
        peerUid: peer,
        lastMessageId: last.id,
        lastBody: last.body,
        lastAt: last.createdAt,
        lastIsMine: last.senderUid === viewerUid,
      });
    }
    items.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
    return items.slice(0, limit);
  });
}

export async function deleteVicinityThread(
  viewerUid: string,
  threadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tid = threadId.trim();
  if (!tid) return { ok: false, error: "Thread id required." };

  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { data: row, error: selErr } = await sb
        .from("vicinity_dm_threads")
        .select("user_a, user_b")
        .eq("id", tid)
        .maybeSingle();
      if (selErr) return { ok: false, error: selErr.message };
      const r = row as { user_a?: string; user_b?: string } | null;
      if (!r?.user_a || !r?.user_b) return { ok: false, error: "Thread not found." };
      if (r.user_a !== viewerUid && r.user_b !== viewerUid) {
        return { ok: false, error: "Not allowed." };
      }
      const { error: delErr } = await sb.from("vicinity_dm_threads").delete().eq("id", tid);
      if (delErr) return { ok: false, error: delErr.message };
      return { ok: true };
    }

    const payload = await readPayload();
    const thread = payload.threads.find((t) => t.id === tid);
    if (!thread) return { ok: false, error: "Thread not found." };
    if (thread.userA !== viewerUid && thread.userB !== viewerUid) {
      return { ok: false, error: "Not allowed." };
    }
    payload.threads = payload.threads.filter((t) => t.id !== tid);
    payload.messages = payload.messages.filter((m) => m.threadId !== tid);
    await writePayload(payload);
    return { ok: true };
  });
}
