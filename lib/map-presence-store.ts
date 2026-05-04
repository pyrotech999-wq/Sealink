/**
 * Ephemeral map “nearby” presence — in-memory only (no filesystem).
 *
 * Vercel serverless: the filesystem is read-only; do not use `fs` here.
 * Each warm Lambda instance holds its own map — peers only see others hitting the same
 * instance until it goes cold. For durable or cross-instance presence, plug in Redis / Vercel KV / Supabase.
 */

import { distanceMiles } from "@/lib/geo-haversine";
import { MAP_NEARBY_RADIUS_MI, MAP_PRESENCE_STALE_SEC } from "@/lib/map-nearby-constants";

export type MapPresenceRecord = {
  sessionId: string;
  lat: number;
  lng: number;
  label: string;
  avatarDataUrl: string;
  updatedAt: string;
  shareNearby: boolean;
};

/** Session id → latest record (only `shareNearby: true` rows are kept). */
const presenceBySession = new Map<string, MapPresenceRecord>();

/** Hard cap to avoid unbounded RAM if abused. */
const MAX_SESSIONS = 5_000;

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function radiusMi(): number {
  const n = Number(process.env.MAP_NEARBY_RADIUS_MI);
  return Number.isFinite(n) && n > 0 ? n : MAP_NEARBY_RADIUS_MI;
}

function staleMs(): number {
  const n = Number(process.env.MAP_PRESENCE_STALE_SEC);
  const sec = Number.isFinite(n) && n > 0 ? n : MAP_PRESENCE_STALE_SEC;
  return sec * 1000;
}

function pruneStale(now: Date): void {
  const ms = staleMs();
  const t = now.getTime();
  for (const [id, r] of presenceBySession) {
    const u = new Date(r.updatedAt).getTime();
    if (t - u > ms) presenceBySession.delete(id);
  }
}

/** If over cap, drop oldest sessions by `updatedAt` until under the limit. */
function enforceMaxSessions(): void {
  if (presenceBySession.size <= MAX_SESSIONS) return;
  const rows = [...presenceBySession.entries()].sort(
    (a, b) => new Date(a[1].updatedAt).getTime() - new Date(b[1].updatedAt).getTime(),
  );
  let over = presenceBySession.size - MAX_SESSIONS;
  for (const [id] of rows) {
    if (over <= 0) break;
    presenceBySession.delete(id);
    over -= 1;
  }
}

export async function upsertPresence(
  sessionId: string,
  patch: { lat: number; lng: number; label: string; avatarDataUrl: string; shareNearby: boolean },
): Promise<void> {
  return enqueue(async () => {
    pruneStale(new Date());
    if (!patch.shareNearby) {
      presenceBySession.delete(sessionId);
      return;
    }
    const next: MapPresenceRecord = {
      sessionId,
      lat: patch.lat,
      lng: patch.lng,
      label: patch.label,
      avatarDataUrl: patch.avatarDataUrl,
      updatedAt: new Date().toISOString(),
      shareNearby: true,
    };
    presenceBySession.set(sessionId, next);
    enforceMaxSessions();
  });
}

export type NearbyPeer = {
  /** Opaque handle for React keys (not the session UUID). */
  id: string;
  lat: number;
  lng: number;
  label: string;
  avatarDataUrl: string;
};

function opaqueId(sessionId: string): string {
  return sessionId.replace(/-/g, "").slice(0, 16);
}

export async function findNearbyPeers(
  lat: number,
  lng: number,
  excludeSessionId: string,
  now = new Date(),
): Promise<NearbyPeer[]> {
  return enqueue(async () => {
    pruneStale(now);

    const maxMi = radiusMi();
    const out: NearbyPeer[] = [];
    for (const r of presenceBySession.values()) {
      if (!r.shareNearby) continue;
      if (r.sessionId === excludeSessionId) continue;
      const mi = distanceMiles(lat, lng, r.lat, r.lng);
      if (mi <= maxMi) {
        out.push({
          id: opaqueId(r.sessionId),
          lat: r.lat,
          lng: r.lng,
          label: r.label,
          avatarDataUrl: r.avatarDataUrl || "",
        });
      }
    }
    return out;
  });
}
