/** Per-device hidden area-broadcast ids (does not remove from server). */

const KEY = "sealink_broadcast_hidden_v1";
const MAX_IDS = 400;
export const BROADCAST_HIDDEN_EVENT = "sealink-broadcast-hidden";

export function readHiddenBroadcastIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return new Set();
    return new Set(p.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function hideBroadcastId(id: string): void {
  try {
    const s = readHiddenBroadcastIds();
    s.add(id);
    localStorage.setItem(KEY, JSON.stringify([...s].slice(-MAX_IDS)));
    window.dispatchEvent(new Event(BROADCAST_HIDDEN_EVENT));
  } catch {
    /* private mode */
  }
}
