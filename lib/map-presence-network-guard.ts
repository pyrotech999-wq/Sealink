/**
 * Hard rate limits for `/api/map/presence` across all component instances and tabs.
 * Prevents stacked intervals / prefetch double-mount / GPS flicker from exceeding production budgets.
 */
let lastPresencePostMs = 0;
let lastPresenceGetMs = 0;

const MIN_POST_MS = 30_000;
const MIN_GET_MS = 55_000;

/** Returns true and reserves a POST turn, or false if too soon since the last allowed POST. */
export function tryConsumeMapPresencePostTurn(now = Date.now()): boolean {
  if (now - lastPresencePostMs < MIN_POST_MS) return false;
  lastPresencePostMs = now;
  return true;
}

/** Returns true and reserves a GET turn, or false if too soon since the last allowed GET. */
export function tryConsumeMapPresenceGetTurn(now = Date.now()): boolean {
  if (now - lastPresenceGetMs < MIN_GET_MS) return false;
  lastPresenceGetMs = now;
  return true;
}
