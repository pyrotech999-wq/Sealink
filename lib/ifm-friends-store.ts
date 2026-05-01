import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { uidFromEmail } from "@/lib/auth";
import { canUseKv, kvGetJson, kvSetJson } from "@/lib/kv-json";
import { normalisePhone } from "@/lib/phone-normalise";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DATA_PATH = path.join(process.cwd(), "data", "ifm-friends.json");
const KV_KEY = "sealink:ifm-friends:v1";

export type IfmFriendRow = {
  kind: "email" | "phone";
  value: string; // email (normalised) OR phoneNorm
  addedAt: string;
};

type StoreShape = Record<string, IfmFriendRow[]>;

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function readStoreFile(): StoreShape {
  try {
    if (!existsSync(DATA_PATH)) return {};
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoreShape;
  } catch {
    return {};
  }
}

function writeStoreFile(store: StoreShape): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), "utf-8");
}

function sortFriends(rows: IfmFriendRow[]): IfmFriendRow[] {
  return rows.slice().sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
}

async function readStoreShape(): Promise<StoreShape> {
  if (canUseKv()) {
    const raw = (await kvGetJson<StoreShape>(KV_KEY, {})) ?? {};
    return raw && typeof raw === "object" ? raw : {};
  }
  return readStoreFile();
}

async function writeStoreShape(store: StoreShape): Promise<void> {
  if (canUseKv()) await kvSetJson(KV_KEY, store);
  else writeStoreFile(store);
}

function rowFromDb(row: { kind: string; value: string; added_at: string }): IfmFriendRow | null {
  if (row.kind !== "email" && row.kind !== "phone") return null;
  return { kind: row.kind, value: row.value, addedAt: row.added_at };
}

/** Loads one user’s friends (no queue — use only inside an `enqueue` callback or standalone). */
async function fetchFriendsForUser(uid: string): Promise<IfmFriendRow[]> {
  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("ifm_friends")
      .select("kind, value, added_at")
      .eq("user_uid", uid)
      .order("added_at", { ascending: false });
    if (error) throw new Error(error.message);
    const out: IfmFriendRow[] = [];
    for (const r of data ?? []) {
      const f = rowFromDb(r as { kind: string; value: string; added_at: string });
      if (f) out.push(f);
    }
    return out;
  }

  const store = await readStoreShape();
  const list = Array.isArray(store[uid]) ? store[uid]! : [];
  return sortFriends(list);
}

export function friendTargets(rows: IfmFriendRow[]): { uids: string[]; phones: string[] } {
  const uids: string[] = [];
  const phones: string[] = [];
  for (const r of rows) {
    if (r.kind === "email") uids.push(uidFromEmail(r.value));
    else if (r.kind === "phone") phones.push(r.value);
  }
  return { uids, phones };
}

export async function listIfmFriends(uid: string): Promise<IfmFriendRow[]> {
  return enqueue(async () => fetchFriendsForUser(uid));
}

export async function addIfmFriend(
  uid: string,
  contact: string,
): Promise<{ ok: true; friends: IfmFriendRow[] } | { ok: false; error: string; friends: IfmFriendRow[] }> {
  return enqueue(async () => {
    const friendsFirst = await fetchFriendsForUser(uid);

    const trimmed = contact.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    const phoneNorm = isEmail ? "" : normalisePhone(trimmed);

    const row: IfmFriendRow | null = isEmail
      ? { kind: "email", value: trimmed.toLowerCase(), addedAt: new Date().toISOString() }
      : phoneNorm
        ? { kind: "phone", value: phoneNorm, addedAt: new Date().toISOString() }
        : null;

    if (!row) {
      return { ok: false, error: "Enter a valid email or phone number.", friends: friendsFirst };
    }

    const dedupeKey = `${row.kind}:${row.value}`;
    const existing = new Set(friendsFirst.map((r) => `${r.kind}:${r.value}`));
    if (existing.has(dedupeKey)) return { ok: true, friends: friendsFirst };

    if (friendsFirst.length >= 100) {
      return { ok: false, error: "Friends list limit reached (100).", friends: friendsFirst };
    }

    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { error } = await sb.from("ifm_friends").insert({
        user_uid: uid,
        kind: row.kind,
        value: row.value,
        added_at: row.addedAt,
      });
      if (error) {
        const code = (error as { code?: string }).code;
        if (code === "23505") return { ok: true, friends: await fetchFriendsForUser(uid) };
        throw new Error(error.message);
      }
      return { ok: true, friends: await fetchFriendsForUser(uid) };
    }

    const store = await readStoreShape();
    const list = Array.isArray(store[uid]) ? store[uid]!.slice() : [];
    list.push(row);
    store[uid] = list;
    await writeStoreShape(store);
    return { ok: true, friends: sortFriends(list) };
  });
}

export async function removeIfmFriend(uid: string, kind: "email" | "phone", value: string): Promise<IfmFriendRow[]> {
  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { error } = await sb.from("ifm_friends").delete().match({ user_uid: uid, kind, value });
      if (error) throw new Error(error.message);
      return fetchFriendsForUser(uid);
    }

    const store = await readStoreShape();
    const list = Array.isArray(store[uid]) ? store[uid]! : [];
    const next = list.filter((r) => !(r.kind === kind && r.value === value));
    store[uid] = next;
    await writeStoreShape(store);
    return sortFriends(next);
  });
}
