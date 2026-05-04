/**
 * When `/api/map/presence` returns 401, set paused so the client stops polling until sign-in is valid again.
 * Stored on globalThis so duplicate bundles share state.
 */
const K = "__sealink_map_presence_401_pause_v1";

export function presenceIsPausedAfter401(): boolean {
  const g = globalThis as unknown as Record<string, boolean | undefined>;
  return g[K] === true;
}

export function presenceSetPausedAfter401(paused: boolean): void {
  const g = globalThis as unknown as Record<string, boolean | undefined>;
  g[K] = paused;
}
