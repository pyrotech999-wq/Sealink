import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { normaliseEmail, uidFromEmail } from "@/lib/auth";
import type { PasswordHash } from "@/lib/password-hash";
import { canUseKv, kvGetJson, kvSetJson } from "@/lib/kv-json";

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

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  return enqueue(async () => {
    const store = canUseKv() ? await kvGetJson<StoreShape>(KV_KEY, {}) : readStore();
    const key = normaliseEmail(email);
    const row = store[key];
    return row && typeof row === "object" ? row : null;
  });
}

export async function upsertUser(email: string, password: PasswordHash): Promise<UserRow> {
  return enqueue(async () => {
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

