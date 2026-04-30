import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { uidFromEmail } from "@/lib/auth";
import { normalisePhone } from "@/lib/phone-normalise";

const DATA_PATH = path.join(process.cwd(), "data", "ifm-friends.json");

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
  return enqueue(async () => {
    const store = readStore();
    const list = Array.isArray(store[uid]) ? store[uid]! : [];
    return list.slice().sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
  });
}

export async function addIfmFriend(uid: string, contact: string): Promise<{ ok: true; friends: IfmFriendRow[] } | { ok: false; error: string; friends: IfmFriendRow[] }> {
  return enqueue(async () => {
    const store = readStore();
    const list = Array.isArray(store[uid]) ? store[uid]! : [];

    const trimmed = contact.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    const phoneNorm = isEmail ? "" : normalisePhone(trimmed);

    const row: IfmFriendRow | null = isEmail
      ? { kind: "email", value: trimmed.toLowerCase(), addedAt: new Date().toISOString() }
      : phoneNorm
        ? { kind: "phone", value: phoneNorm, addedAt: new Date().toISOString() }
        : null;

    if (!row) return { ok: false, error: "Enter a valid email or phone number.", friends: list };

    const dedupeKey = `${row.kind}:${row.value}`;
    const existing = new Set(list.map((r) => `${r.kind}:${r.value}`));
    if (existing.has(dedupeKey)) return { ok: true, friends: list };

    if (list.length >= 100) return { ok: false, error: "Friends list limit reached (100).", friends: list };

    list.push(row);
    store[uid] = list;
    writeStore(store);
    return { ok: true, friends: list };
  });
}

export async function removeIfmFriend(uid: string, kind: "email" | "phone", value: string): Promise<IfmFriendRow[]> {
  return enqueue(async () => {
    const store = readStore();
    const list = Array.isArray(store[uid]) ? store[uid]! : [];
    const next = list.filter((r) => !(r.kind === kind && r.value === value));
    store[uid] = next;
    writeStore(store);
    return next;
  });
}

