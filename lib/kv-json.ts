import { kv } from "@vercel/kv";

export function canUseKv(): boolean {
  // Vercel KV injects env like KV_REST_API_URL / KV_REST_API_TOKEN.
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function kvGetJson<T>(key: string, fallback: T): Promise<T> {
  // @upstash/redis deserializes string values with JSON.parse by default, so GET often returns an object, not a string.
  const raw = (await kv.get<unknown>(key)) ?? null;
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw as T;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export async function kvSetJson(key: string, value: unknown): Promise<void> {
  await kv.set(key, JSON.stringify(value));
}

