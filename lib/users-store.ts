import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { normaliseEmail, uidFromEmail } from "@/lib/auth";
import type { PasswordHash } from "@/lib/password-hash";
import { canUseKv, kvGetJson, kvSetJson } from "@/lib/kv-json";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type UserRow = {
  uid: string;
  email: string;
  password: PasswordHash;
  createdAt: string;
  updatedAt: string;
};

type StoreShape = Record<string, UserRow>;

const DATA_PATH = path.join(process.cwd(), "data", "users.json");
const KV_KEY = "sealink:users:v1";
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function readStore(): StoreShape {
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

function writeStore(store: StoreShape): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), "utf-8");
}

function rowFromDb(data: {
  uid: string;
  email: string;
  password_hash: unknown;
  created_at: string;
  updated_at: string;
}): UserRow {
  return {
    uid: data.uid,
    email: data.email,
    password: data.password_hash as PasswordHash,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

async function getUserByEmailSupabase(email: string): Promise<UserRow | null> {
  const sb = supabaseAdmin();
  const key = normaliseEmail(email);
  const { data, error } = await sb.from("user_accounts").select("*").eq("email", key).maybeSingle();
  if (error || !data) return null;
  return rowFromDb(data as Parameters<typeof rowFromDb>[0]);
}

async function upsertUserSupabase(email: string, password: PasswordHash): Promise<UserRow> {
  const sb = supabaseAdmin();
  const key = normaliseEmail(email);
  const now = new Date().toISOString();
  const { data: prev } = await sb.from("user_accounts").select("uid,created_at").eq("email", key).maybeSingle();
  const uid =
    prev && typeof (prev as { uid?: string }).uid === "string"
      ? (prev as { uid: string }).uid
      : uidFromEmail(key);
  const createdAt =
    prev && typeof (prev as { created_at?: string }).created_at === "string"
      ? (prev as { created_at: string }).created_at
      : now;

  const { error } = await sb.from("user_accounts").upsert(
    {
      uid,
      email: key,
      password_hash: password,
      created_at: createdAt,
      updated_at: now,
    },
    { onConflict: "email" },
  );
  if (error) throw new Error(error.message);

  return { uid, email: key, password, createdAt, updatedAt: now };
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      return getUserByEmailSupabase(email);
    }
    const store = canUseKv() ? await kvGetJson<StoreShape>(KV_KEY, {}) : readStore();
    const key = normaliseEmail(email);
    const row = store[key];
    return row && typeof row === "object" ? row : null;
  });
}

export async function upsertUser(email: string, password: PasswordHash): Promise<UserRow> {
  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      return upsertUserSupabase(email, password);
    }
    const now = new Date().toISOString();
    const store = canUseKv() ? await kvGetJson<StoreShape>(KV_KEY, {}) : readStore();
    const key = normaliseEmail(email);
    const prev = store[key];
    const uid = prev?.uid && typeof prev.uid === "string" ? prev.uid : uidFromEmail(key);
    const createdAt = prev?.createdAt && typeof prev.createdAt === "string" ? prev.createdAt : now;
    const next: UserRow = {
      uid,
      email: key,
      password,
      createdAt,
      updatedAt: now,
    };
    store[key] = next;
    if (canUseKv()) await kvSetJson(KV_KEY, store);
    else writeStore(store);
    return next;
  });
}
