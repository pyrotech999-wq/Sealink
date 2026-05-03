import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { normaliseEmail, uidFromEmail } from "@/lib/auth";
import type { PasswordHash } from "@/lib/password-hash";
import { hashPassword } from "@/lib/password-hash";
import { canUseKv, kvGetJson, kvSetJson } from "@/lib/kv-json";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OauthProviderId } from "@/lib/oauth-pkce-cookie";

export type UserRow = {
  uid: string;
  email: string;
  password: PasswordHash;
  createdAt: string;
  updatedAt: string;
  oauthProvider?: string | null;
  oauthSub?: string | null;
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

type UserAccountRowDb = {
  uid: string;
  email: string;
  password_hash: unknown;
  created_at: string;
  updated_at: string;
  oauth_provider?: unknown;
  oauth_sub?: unknown;
};

function rowFromDb(data: UserAccountRowDb): UserRow {
  return {
    uid: data.uid,
    email: data.email,
    password: data.password_hash as PasswordHash,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    oauthProvider: typeof data.oauth_provider === "string" ? data.oauth_provider : null,
    oauthSub: typeof data.oauth_sub === "string" ? data.oauth_sub : null,
  };
}

async function getUserByEmailSupabase(email: string): Promise<UserRow | null> {
  const sb = supabaseAdmin();
  const key = normaliseEmail(email);
  const { data, error } = await sb.from("user_accounts").select("*").eq("email", key).maybeSingle();
  if (error || !data) return null;
  return rowFromDb(data as UserAccountRowDb);
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

async function getUserFromKvOrFile(emailKey: string): Promise<UserRow | null> {
  const store = canUseKv() ? await kvGetJson<StoreShape>(KV_KEY, {}) : readStore();
  const row = store[emailKey];
  return row && typeof row === "object" ? row : null;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  return enqueue(async () => {
    const key = normaliseEmail(email);
    if (isSupabaseConfigured()) {
      try {
        const fromSb = await getUserByEmailSupabase(email);
        if (fromSb) return fromSb;
      } catch (e) {
        console.error("[users-store] Supabase user lookup failed; falling back to KV/file", e);
      }
      // Accounts created before Supabase lived only in KV — still try KV so sign-in keeps working.
      return getUserFromKvOrFile(key);
    }
    return getUserFromKvOrFile(key);
  });
}

/** For admin tooling only — list recent accounts (server must enforce admin). */
export async function getUserEmailByUid(uid: string): Promise<string | null> {
  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { data, error } = await sb.from("user_accounts").select("email").eq("uid", uid).maybeSingle();
      if (error || !data) return null;
      const e = (data as { email?: string }).email;
      return typeof e === "string" && e.trim() ? e : null;
    }
    const store = canUseKv() ? await kvGetJson<StoreShape>(KV_KEY, {}) : readStore();
    for (const row of Object.values(store)) {
      if (row.uid === uid) return row.email;
    }
    return null;
  });
}

export async function listUserAccountsBrief(): Promise<{ uid: string; email: string; createdAt: string }[]> {
  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("user_accounts")
        .select("uid,email,created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: Record<string, unknown>) => ({
        uid: String(r.uid ?? ""),
        email: String(r.email ?? ""),
        createdAt: String(r.created_at ?? ""),
      }));
    }
    const store = canUseKv() ? await kvGetJson<StoreShape>(KV_KEY, {}) : readStore();
    return Object.values(store).map((u) => ({ uid: u.uid, email: u.email, createdAt: u.createdAt }));
  });
}

export type OauthSignInResult =
  | { ok: true; user: UserRow; isNew: boolean }
  | { ok: false; code: "password_account_exists" | "oauth_email_mismatch" | "supabase_off" };

/**
 * Find or create a user for an OAuth identity. Email must be normalised and non-empty.
 * Rejects if the same email already exists as an email+password account (no oauth_sub).
 */
export async function oauthSignInOrRegister(params: {
  provider: OauthProviderId;
  sub: string;
  email: string;
}): Promise<OauthSignInResult> {
  return enqueue(async () => {
    if (!isSupabaseConfigured()) return { ok: false, code: "supabase_off" };
    const provider = params.provider;
    const sub = params.sub.trim();
    const email = normaliseEmail(params.email);
    if (!sub || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, code: "oauth_email_mismatch" };
    }

    const sb = supabaseAdmin();
    const { data: byOauthRow, error: errOauth } = await sb
      .from("user_accounts")
      .select("*")
      .eq("oauth_provider", provider)
      .eq("oauth_sub", sub)
      .maybeSingle();
    if (!errOauth && byOauthRow) {
      return { ok: true, user: rowFromDb(byOauthRow as UserAccountRowDb), isNew: false };
    }

    const existing = await getUserByEmailSupabase(email);
    if (existing) {
      const hasOauth = Boolean(existing.oauthSub && existing.oauthProvider);
      if (!hasOauth) return { ok: false, code: "password_account_exists" };
      if (existing.oauthProvider !== provider || existing.oauthSub !== sub) {
        return { ok: false, code: "oauth_email_mismatch" };
      }
      return { ok: true, user: existing, isNew: false };
    }

    const uid = uidFromEmail(email);
    const now = new Date().toISOString();
    const password = hashPassword(randomBytes(48).toString("hex"));
    const { error } = await sb.from("user_accounts").insert({
      uid,
      email,
      password_hash: password,
      oauth_provider: provider,
      oauth_sub: sub,
      created_at: now,
      updated_at: now,
    });
    if (error) {
      const retry = await getUserByEmailSupabase(email);
      if (retry && retry.oauthProvider === provider && retry.oauthSub === sub) {
        return { ok: true, user: retry, isNew: false };
      }
      throw new Error(error.message);
    }

    return {
      ok: true,
      user: { uid, email, password, createdAt: now, updatedAt: now, oauthProvider: provider, oauthSub: sub },
      isNew: true,
    };
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
