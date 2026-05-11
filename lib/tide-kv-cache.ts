import { kv } from "@vercel/kv";
import { canUseKv } from "@/lib/kv-json";

const KV_PREFIX = "tide:";

type KvCacheEntry<T> = { storedAt: number; value: T };

export async function tideKvGet<T>(
  bucket: string,
  ttlMs: number,
): Promise<{ hit: true; value: T } | { hit: false }> {
  if (!canUseKv()) return { hit: false };
  try {
    const raw = await kv.get<KvCacheEntry<T>>(`${KV_PREFIX}${bucket}`);
    if (!raw || typeof raw !== "object") return { hit: false };
    const entry = raw as KvCacheEntry<T>;
    if (!entry.storedAt || Date.now() - entry.storedAt > ttlMs) return { hit: false };
    return { hit: true, value: entry.value };
  } catch {
    return { hit: false };
  }
}

export async function tideKvSet<T>(
  bucket: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  if (!canUseKv()) return;
  try {
    const entry: KvCacheEntry<T> = { storedAt: Date.now(), value };
    await kv.set(`${KV_PREFIX}${bucket}`, entry, { ex: ttlSeconds });
  } catch {
    /* KV write failure is non-fatal */
  }
}
