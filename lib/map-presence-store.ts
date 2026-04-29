import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { distanceMiles } from "@/lib/geo-haversine";
import { MAP_NEARBY_RADIUS_MI, MAP_PRESENCE_STALE_SEC } from "@/lib/map-nearby-constants";

const DATA_PATH = path.join(process.cwd(), "data", "map-nearby-presence.json");

export type MapPresenceRecord = {
  sessionId: string;
  lat: number;
  lng: number;
  label: string;
  updatedAt: string;
  shareNearby: boolean;
};

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function readRaw(): MapPresenceRecord[] {
  try {
    if (!existsSync(DATA_PATH)) return [];
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as MapPresenceRecord[];
  } catch {
    return [];
  }
}

function writeRaw(list: MapPresenceRecord[]): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(list, null, 2), "utf-8");
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

function pruneStale(list: MapPresenceRecord[], now: Date): MapPresenceRecord[] {
  const ms = staleMs();
  const t = now.getTime();
  return list.filter((r) => {
    const u = new Date(r.updatedAt).getTime();
    if (t - u > ms) return false;
    return true;
  });
}

export async function upsertPresence(
  sessionId: string,
  patch: { lat: number; lng: number; label: string; shareNearby: boolean },
): Promise<void> {
  return enqueue(async () => {
    let list = pruneStale(readRaw(), new Date());
    if (!patch.shareNearby) {
      list = list.filter((r) => r.sessionId !== sessionId);
      writeRaw(list);
      return;
    }
    const next: MapPresenceRecord = {
      sessionId,
      lat: patch.lat,
      lng: patch.lng,
      label: patch.label,
      updatedAt: new Date().toISOString(),
      shareNearby: true,
    };
    const idx = list.findIndex((r) => r.sessionId === sessionId);
    if (idx >= 0) list[idx] = next;
    else list.push(next);
    writeRaw(list);
  });
}

export type NearbyPeer = {
  /** Opaque handle for React keys (not the session UUID). */
  id: string;
  lat: number;
  lng: number;
  label: string;
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
    const raw = readRaw();
    const list = pruneStale(raw, now);
    if (list.length !== raw.length) writeRaw(list);

    const maxMi = radiusMi();
    const out: NearbyPeer[] = [];
    for (const r of list) {
      if (!r.shareNearby) continue;
      if (r.sessionId === excludeSessionId) continue;
      const mi = distanceMiles(lat, lng, r.lat, r.lng);
      if (mi <= maxMi) {
        out.push({
          id: opaqueId(r.sessionId),
          lat: r.lat,
          lng: r.lng,
          label: r.label,
        });
      }
    }
    return out;
  });
}
