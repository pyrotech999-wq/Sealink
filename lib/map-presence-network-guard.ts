/**
 * Client-side guard for `/api/map/presence`: one HTTP call (GET or POST) per wall window,
 * plus a cooldown after the server signals throttle. Uses globalThis so duplicate bundles share state.
 */
const GKEY = "__sealink_map_presence_client_v2";

type Guard = {
  lastHttpAt: number;
  cooldownUntil: number;
};

const MIN_PRESENCE_HTTP_MS = 60_000;
const SERVER_THROTTLE_COOLDOWN_MS = 60_000;

function guard(): Guard {
  const g = globalThis as unknown as Record<string, Guard | undefined>;
  if (!g[GKEY]) {
    g[GKEY] = { lastHttpAt: 0, cooldownUntil: 0 };
  }
  return g[GKEY]!;
}

/**
 * After GET `{ throttled: true }` or POST `{ rateLimited: true }`, stop all presence HTTP for this long.
 */
export function setMapPresenceServerThrottleCooldown(now = Date.now(), ms = SERVER_THROTTLE_COOLDOWN_MS): void {
  const s = guard();
  s.cooldownUntil = Math.max(s.cooldownUntil, now + ms);
}

/**
 * Reserve one presence HTTP slot. Call immediately before fetch().
 * - `force`: skip the 60s minimum gap (still blocked while `cooldownUntil` is active unless `ignoreCooldown`).
 * - `ignoreCooldown`: use for keepalive unload clears so the browser can still send a best-effort POST.
 */
export function tryConsumeMapPresenceHttpSlot(
  now = Date.now(),
  opts?: { force?: boolean; ignoreCooldown?: boolean },
): boolean {
  const s = guard();
  if (!opts?.ignoreCooldown && now < s.cooldownUntil) return false;
  if (!opts?.force && s.lastHttpAt > 0 && now - s.lastHttpAt < MIN_PRESENCE_HTTP_MS) return false;
  s.lastHttpAt = now;
  return true;
}
