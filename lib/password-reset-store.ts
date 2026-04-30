import { createHash, randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { canUseKv, kvGetJson, kvSetJson } from "@/lib/kv-json";

export type ResetRow = {
  /** sha256(token) hex */
  tokenHash: string;
  email: string;
  uid: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  requestedFromIp: string | null;
};

type StoreShape = {
  resets: ResetRow[];
  /** best-effort throttling */
  lastRequestByEmail: Record<string, string>;
  lastRequestByIp: Record<string, string>;
};

const DATA_PATH = path.join(process.cwd(), "data", "password-resets.json");
const KV_KEY = "sealink:password-resets:v1";
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
    if (!existsSync(DATA_PATH)) return { resets: [], lastRequestByEmail: {}, lastRequestByIp: {} };
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { resets: [], lastRequestByEmail: {}, lastRequestByIp: {} };
    const o = parsed as Partial<StoreShape>;
    return {
      resets: Array.isArray(o.resets) ? (o.resets as ResetRow[]) : [],
      lastRequestByEmail: o.lastRequestByEmail && typeof o.lastRequestByEmail === "object" ? (o.lastRequestByEmail as Record<string, string>) : {},
      lastRequestByIp: o.lastRequestByIp && typeof o.lastRequestByIp === "object" ? (o.lastRequestByIp as Record<string, string>) : {},
    };
  } catch {
    return { resets: [], lastRequestByEmail: {}, lastRequestByIp: {} };
  }
}

function writeStore(store: StoreShape): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), "utf-8");
}

function sha256Hex(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isTooSoon(lastIso: string | undefined, nowMs: number, minMs: number): boolean {
  if (!lastIso) return false;
  const lastMs = new Date(lastIso).getTime();
  return Number.isFinite(lastMs) && nowMs - lastMs < minMs;
}

export type CreateResetResult =
  | { ok: true; token: string }
  | { ok: false; error: "THROTTLED" };

export async function createResetToken(opts: {
  email: string;
  uid: string;
  ip: string | null;
  ttlMinutes?: number;
}): Promise<CreateResetResult> {
  const ttlMin = typeof opts.ttlMinutes === "number" && opts.ttlMinutes > 0 ? opts.ttlMinutes : 30;
  return enqueue(async () => {
    const now = new Date();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();
    const store = canUseKv()
      ? await kvGetJson<StoreShape>(KV_KEY, { resets: [], lastRequestByEmail: {}, lastRequestByIp: {} })
      : readStore();

    const emailKey = opts.email.toLowerCase();
    if (isTooSoon(store.lastRequestByEmail[emailKey], nowMs, 60_000)) return { ok: false, error: "THROTTLED" };
    if (opts.ip && isTooSoon(store.lastRequestByIp[opts.ip], nowMs, 30_000)) return { ok: false, error: "THROTTLED" };

    // Generate raw token; store only hash.
    const token = randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(nowMs + ttlMin * 60_000).toISOString();

    store.resets.push({
      tokenHash,
      email: emailKey,
      uid: opts.uid,
      createdAt: nowIso,
      expiresAt,
      usedAt: null,
      requestedFromIp: opts.ip,
    });
    store.lastRequestByEmail[emailKey] = nowIso;
    if (opts.ip) store.lastRequestByIp[opts.ip] = nowIso;

    // Keep file small.
    const cutoff = nowMs - 7 * 24 * 60 * 60_000;
    store.resets = store.resets.filter((r) => new Date(r.createdAt).getTime() >= cutoff);

    if (canUseKv()) await kvSetJson(KV_KEY, store);
    else writeStore(store);
    return { ok: true, token };
  });
}

export type ConsumeResult =
  | { ok: true; email: string; uid: string }
  | { ok: false; error: "INVALID_OR_EXPIRED" };

export async function consumeResetToken(token: string): Promise<ConsumeResult> {
  return enqueue(async () => {
    const store = canUseKv()
      ? await kvGetJson<StoreShape>(KV_KEY, { resets: [], lastRequestByEmail: {}, lastRequestByIp: {} })
      : readStore();
    const h = sha256Hex(token);
    const nowMs = Date.now();
    const row = store.resets
      .slice()
      .reverse()
      .find((r) => r.tokenHash === h);

    if (!row) return { ok: false, error: "INVALID_OR_EXPIRED" };
    if (row.usedAt) return { ok: false, error: "INVALID_OR_EXPIRED" };
    const expMs = new Date(row.expiresAt).getTime();
    if (!Number.isFinite(expMs) || expMs < nowMs) return { ok: false, error: "INVALID_OR_EXPIRED" };

    // Mark used.
    const usedAt = new Date().toISOString();
    for (const r of store.resets) {
      if (r.tokenHash === h) r.usedAt = usedAt;
    }
    if (canUseKv()) await kvSetJson(KV_KEY, store);
    else writeStore(store);
    return { ok: true, email: row.email, uid: row.uid };
  });
}

