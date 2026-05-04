/**
 * In-process rate limit for `/api/map/presence` (GET/POST upsert only).
 * Cuts CPU + Vercel invocations when clients misbehave; not cross-instance (serverless),
 * but warm instances and single-instance dev benefit. Key prefers stable session id, else IP.
 */

type Row = { lastGet: number; lastPost: number };
const rows = new Map<string, Row>();

const MAX_KEYS = 8_000;
const GET_MIN_MS = 60_000;
const POST_MIN_MS = 30_000;

function pruneIfNeeded(): void {
  if (rows.size <= MAX_KEYS) return;
  const entries = [...rows.entries()].sort((a, b) => Math.min(a[1].lastGet, a[1].lastPost) - Math.min(b[1].lastGet, b[1].lastPost));
  const drop = Math.ceil(entries.length * 0.2);
  for (let i = 0; i < drop; i++) rows.delete(entries[i]![0]);
}

function row(key: string): Row {
  let r = rows.get(key);
  if (!r) {
    r = { lastGet: 0, lastPost: 0 };
    rows.set(key, r);
  }
  return r;
}

export function presenceThrottleKey(sessionId: string, cookieFresh: boolean, req: Request): string {
  if (!cookieFresh && sessionId) return `s:${sessionId}`;
  const xf = req.headers.get("x-forwarded-for");
  const ip = (xf?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "na").slice(0, 64);
  return `i:${ip}`;
}

export function presenceAllowGet(key: string, now = Date.now()): boolean {
  pruneIfNeeded();
  const r = row(key);
  if (now - r.lastGet < GET_MIN_MS) return false;
  r.lastGet = now;
  return true;
}

/** POST upsert only; do not use for shareNearby:false clears. */
export function presenceAllowPostUpsert(key: string, now = Date.now()): boolean {
  pruneIfNeeded();
  const r = row(key);
  if (now - r.lastPost < POST_MIN_MS) return false;
  r.lastPost = now;
  return true;
}
