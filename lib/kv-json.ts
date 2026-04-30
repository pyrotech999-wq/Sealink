import { kv } from "@vercel/kv";

export function canUseKv(): boolean {
  // Vercel KV injects env like KV_REST_API_URL / KV_REST_API_TOKEN.
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function kvGetJson<T>(key: string, fallback: T): Promise<T> {
  const raw = (await kv.get<string>(key)) ?? null;
  if (!raw || typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function kvSetJson(key: string, value: unknown): Promise<void> {
  await kv.set(key, JSON.stringify(value));
}

