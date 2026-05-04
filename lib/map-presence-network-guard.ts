/**
 * Client-side rate limits for `/api/map/presence` (browser globalThis so duplicate bundles
 * still share one clock). POST/GET upserts + minimum gap between full tick() runs.
 */
const GKEY = "__sealink_map_presence_client_v1";

type Guard = {
  lastPost: number;
  lastGet: number;
  lastTick: number;
  lastClearPost: number;
};

function guard(): Guard {
  const g = globalThis as unknown as Record<string, Guard | undefined>;
  if (!g[GKEY]) {
    g[GKEY] = { lastPost: 0, lastGet: 0, lastTick: 0, lastClearPost: 0 };
  }
  return g[GKEY]!;
}

/** Hard caps aligned with product: POST ≤1/30s, GET ≤1/60s on this device (all map instances share guard). */
const MIN_POST_MS = 30_000;
const MIN_GET_MS = 60_000;
/** Minimum wall time between full presence ticks (interval + stray callers). */
const MIN_TICK_MS = 60_000;
const MIN_CLEAR_POST_MS = 30_000;

/** Gate interval/stray tick spam; callers that need an immediate run (e.g. forced refresh) should skip this check. */
export function tryBeginPresenceClientTick(now = Date.now()): boolean {
  const s = guard();
  if (now - s.lastTick < MIN_TICK_MS) return false;
  s.lastTick = now;
  return true;
}

/** Returns true and reserves a POST turn (upsert), or false if too soon. */
export function tryConsumeMapPresencePostTurn(now = Date.now()): boolean {
  const s = guard();
  if (now - s.lastPost < MIN_POST_MS) return false;
  s.lastPost = now;
  return true;
}

/** Returns true and reserves a GET turn, or false if too soon. */
export function tryConsumeMapPresenceGetTurn(now = Date.now()): boolean {
  const s = guard();
  if (now - s.lastGet < MIN_GET_MS) return false;
  s.lastGet = now;
  return true;
}

/** Throttle clear / unmount POST bursts. */
export function tryConsumeMapPresenceClearPost(now = Date.now()): boolean {
  const s = guard();
  if (now - s.lastClearPost < MIN_CLEAR_POST_MS) return false;
  s.lastClearPost = now;
  return true;
}
