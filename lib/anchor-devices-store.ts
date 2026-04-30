import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "data", "anchor-devices.json");

export type AnchorDeviceRow = {
  uid: string; // account uid
  deviceId: string;
  name: string;
  updatedAt: string;
  lastLat: number | null;
  lastLng: number | null;
  lastFixAt: string | null;
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

function readRaw(): AnchorDeviceRow[] {
  try {
    if (!existsSync(DATA_PATH)) return [];
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as AnchorDeviceRow[];
  } catch {
    return [];
  }
}

function writeRaw(list: AnchorDeviceRow[]): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(list, null, 2), "utf-8");
}

function prune(list: AnchorDeviceRow[], now = new Date()): AnchorDeviceRow[] {
  // keep 45 days of device rows
  const cutoff = now.getTime() - 45 * 24 * 60 * 60 * 1000;
  return list.filter((r) => new Date(r.updatedAt).getTime() >= cutoff);
}

export async function upsertAnchorDevice(
  uid: string,
  deviceId: string,
  patch: Partial<Pick<AnchorDeviceRow, "name" | "lastLat" | "lastLng" | "lastFixAt">>,
): Promise<void> {
  return enqueue(async () => {
    const now = new Date();
    const raw = prune(readRaw(), now);
    const idx = raw.findIndex((r) => r.uid === uid && r.deviceId === deviceId);
    const next: AnchorDeviceRow = {
      uid,
      deviceId,
      name: typeof patch.name === "string" ? patch.name.slice(0, 40) : idx >= 0 ? raw[idx]!.name : "This device",
      updatedAt: now.toISOString(),
      lastLat: typeof patch.lastLat === "number" ? patch.lastLat : idx >= 0 ? raw[idx]!.lastLat : null,
      lastLng: typeof patch.lastLng === "number" ? patch.lastLng : idx >= 0 ? raw[idx]!.lastLng : null,
      lastFixAt: typeof patch.lastFixAt === "string" ? patch.lastFixAt : idx >= 0 ? raw[idx]!.lastFixAt : null,
    };
    if (idx >= 0) raw[idx] = next;
    else raw.push(next);
    writeRaw(raw);
  });
}

export async function listAnchorDevices(uid: string): Promise<AnchorDeviceRow[]> {
  return enqueue(async () => {
    const now = new Date();
    const raw = prune(readRaw(), now);
    if (raw.length !== readRaw().length) writeRaw(raw);
    return raw.filter((r) => r.uid === uid).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });
}

