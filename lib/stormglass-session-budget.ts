/**
 * Rolling 60-minute budget for upstream Stormglass HTTP calls per browser (cookie).
 * Max 3 successful upstream calls per window (weather + tide share the same counter).
 */

export const STORMGLASS_UPSTREAM_BUDGET_COOKIE = "sealink_sg_upstream";
export const STORMGLASS_MAX_UPSTREAM_PER_HOUR = 3;
const WINDOW_MS = 60 * 60 * 1000;

export type StormglassBudgetState = {
  count: number;
  /** Start of the current rolling window (epoch ms). */
  windowStart: number;
};

function parseCookieHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function readStormglassBudget(cookieHeader: string | null): StormglassBudgetState {
  const raw = parseCookieHeader(cookieHeader, STORMGLASS_UPSTREAM_BUDGET_COOKIE);
  if (!raw) return { count: 0, windowStart: 0 };
  const m = /^(\d+)\|(\d+)$/.exec(raw);
  if (!m) return { count: 0, windowStart: 0 };
  const count = Number(m[1]);
  const windowStart = Number(m[2]);
  if (!Number.isFinite(count) || !Number.isFinite(windowStart) || count < 0) {
    return { count: 0, windowStart: 0 };
  }
  return { count, windowStart };
}

function normalizeState(now: number, s: StormglassBudgetState): StormglassBudgetState {
  if (!s.windowStart || now - s.windowStart >= WINDOW_MS) {
    return { count: 0, windowStart: now };
  }
  return { ...s, windowStart: s.windowStart };
}

/** Returns true if one more upstream Stormglass HTTP call is allowed right now. */
export function stormglassUpstreamAllowed(cookieHeader: string | null): boolean {
  const now = Date.now();
  const s = normalizeState(now, readStormglassBudget(cookieHeader));
  return s.count < STORMGLASS_MAX_UPSTREAM_PER_HOUR;
}

/** After completing upstream call(s) that were not served from server cache. */
export function serializeStormglassBudgetAfterUpstream(
  cookieHeader: string | null,
  upstreamCalls: number,
): string | null {
  if (upstreamCalls <= 0) return null;
  const now = Date.now();
  const s = normalizeState(now, readStormglassBudget(cookieHeader));
  const next: StormglassBudgetState = {
    windowStart: s.windowStart || now,
    count: s.count + upstreamCalls,
  };
  const maxAgeSec = Math.max(60, Math.ceil((next.windowStart + WINDOW_MS - now) / 1000));
  const val = `${next.count}|${next.windowStart}`;
  return `${STORMGLASS_UPSTREAM_BUDGET_COOKIE}=${encodeURIComponent(val)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax; HttpOnly`;
}
