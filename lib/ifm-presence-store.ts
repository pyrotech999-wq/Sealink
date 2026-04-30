import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { distanceMiles } from "@/lib/geo-haversine";

const DATA_PATH = path.join(process.cwd(), "data", "ifm-presence.json");

export type IfmPresenceRecord = {
  uid: string;
  lat: number;
  lng: number;
  fullName: string;
  boatName: string;
  avatarDataUrl: string;
  phoneNorm: string;
  updatedAt: string;
  share: boolean;
};

export type IfmPeer = {
  uid: string;
  lat: number;
  lng: number;
  fullName: string;
  boatName: string;
  avatarDataUrl: string;
  phoneNorm: string;
  updatedAt: string;
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

function readRaw(): IfmPresenceRecord[] {
  try {
    if (!existsSync(DATA_PATH)) return [];
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as IfmPresenceRecord[];
  } catch {
    return [];
  }
}

function writeRaw(list: IfmPresenceRecord[]): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(list, null, 2), "utf-8");
}

function staleMs(): number {
  // 20 minutes feels reasonable for a "world map" view.
  return 20 * 60 * 1000;
}

function prune(list: IfmPresenceRecord[], now: Date): IfmPresenceRecord[] {
  const cutoff = now.getTime() - staleMs();
  return list.filter((r) => new Date(r.updatedAt).getTime() >= cutoff);
}

function toPeer(r: IfmPresenceRecord): IfmPeer {
  return {
    uid: r.uid,
    lat: r.lat,
    lng: r.lng,
    fullName: r.fullName,
    boatName: r.boatName,
    avatarDataUrl: r.avatarDataUrl || "",
    phoneNorm: r.phoneNorm || "",
    updatedAt: r.updatedAt,
  };
}

export async function upsertIfmPresence(
  uid: string,
  patch: {
    lat: number;
    lng: number;
    fullName: string;
    boatName: string;
    avatarDataUrl: string;
    phoneNorm: string;
    share: boolean;
  },
): Promise<void> {
  return enqueue(async () => {
    let list = prune(readRaw(), new Date());
    if (!patch.share) {
      list = list.filter((r) => r.uid !== uid);
      writeRaw(list);
      return;
    }

    const next: IfmPresenceRecord = {
      uid,
      lat: patch.lat,
      lng: patch.lng,
      fullName: patch.fullName,
      boatName: patch.boatName,
      avatarDataUrl: patch.avatarDataUrl,
      phoneNorm: patch.phoneNorm,
      updatedAt: new Date().toISOString(),
      share: true,
    };
    const idx = list.findIndex((r) => r.uid === uid);
    if (idx >= 0) list[idx] = next;
    else list.push(next);
    writeRaw(list);
  });
}

export async function listAllIfmPeers(excludeUid: string, now = new Date()): Promise<IfmPeer[]> {
  return enqueue(async () => {
    const raw = readRaw();
    const list = prune(raw, now);
    if (list.length !== raw.length) writeRaw(list);
    return list
      .filter((r) => r.share && r.uid !== excludeUid)
      .map(toPeer)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });
}

export async function listIfmPeersLocal(
  lat: number,
  lng: number,
  radiusMi: number,
  excludeUid: string,
  now = new Date(),
): Promise<IfmPeer[]> {
  return enqueue(async () => {
    const raw = readRaw();
    const list = prune(raw, now);
    if (list.length !== raw.length) writeRaw(list);
    const out: IfmPeer[] = [];
    for (const r of list) {
      if (!r.share) continue;
      if (r.uid === excludeUid) continue;
      const mi = distanceMiles(lat, lng, r.lat, r.lng);
      if (mi <= radiusMi) out.push(toPeer(r));
    }
    return out;
  });
}

export async function listIfmPeersByContacts(
  excludeUid: string,
  wantUids: string[],
  wantPhones: string[],
  now = new Date(),
): Promise<IfmPeer[]> {
  return enqueue(async () => {
    const uidSet = new Set(wantUids.filter(Boolean));
    const phoneSet = new Set(wantPhones.filter(Boolean));
    const raw = readRaw();
    const list = prune(raw, now);
    if (list.length !== raw.length) writeRaw(list);
    return list
      .filter((r) => r.share && r.uid !== excludeUid && (uidSet.has(r.uid) || (r.phoneNorm && phoneSet.has(r.phoneNorm))))
      .map(toPeer)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });
}

