/**
 * Rolling 60-minute cap on upstream Stormglass HTTP calls per client identity.
 *
 * Uses an in-process Map (synchronous reserve / release) so concurrent requests cannot
 * undercount the way read-then-Set-Cookie cookie budgets can when responses race.
 *
 * Key: client IP from trusted proxy headers (`stormglassBudgetClientKey`). On multi-instance
 * deploys each instance has its own counter (stricter in aggregate). For global caps use Redis/KV.
 */

export const STORMGLASS_MAX_UPSTREAM_PER_HOUR = 3;
const WINDOW_MS = 60 * 60 * 1000;

type Mem = { count: number; windowStart: number };
const mem = new Map<string, Mem>();

function normalizeWindow(now: number, e: Mem): Mem {
  if (!e.windowStart || now - e.windowStart >= WINDOW_MS) {
    return { count: 0, windowStart: now };
  }
  return e;
}

/** Best-effort client key for budget isolation (shared NAT ⇒ shared cap). */
export function stormglassBudgetClientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  const ip =
    first || req.headers.get("x-real-ip")?.trim() || req.headers.get("cf-connecting-ip")?.trim() || "";
  return ip || "unknown";
}

/**
 * Synchronously reserves one hourly slot before an upstream Stormglass attempt.
 * If the attempt does not consume upstream bandwidth (cache hit, deduped, or error), call
 * `stormglassMemoryReleaseUpstreamSlot` for the same key.
 */
export function stormglassMemoryReserveUpstreamSlot(clientKey: string): boolean {
  const now = Date.now();
  let e = mem.get(clientKey);
  e = e ? normalizeWindow(now, e) : { count: 0, windowStart: now };
  if (e.count >= STORMGLASS_MAX_UPSTREAM_PER_HOUR) return false;
  mem.set(clientKey, { windowStart: e.windowStart, count: e.count + 1 });
  return true;
}

/** Undo a reserve when no new upstream HTTP was charged (or after a thrown error before upstream). */
export function stormglassMemoryReleaseUpstreamSlot(clientKey: string): void {
  const now = Date.now();
  let e = mem.get(clientKey);
  if (!e) return;
  e = normalizeWindow(now, e);
  if (e.count <= 0) return;
  mem.set(clientKey, { windowStart: e.windowStart, count: e.count - 1 });
}
