import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { distanceMiles } from "@/lib/geo-haversine";
import { MAP_BROADCAST_RATE_PER_HOUR, MAP_BROADCAST_RETENTION_HOURS } from "@/lib/map-broadcast-constants";
import { MAP_NEARBY_RADIUS_MI } from "@/lib/map-nearby-constants";

const DATA_PATH = path.join(process.cwd(), "data", "map-broadcast-messages.json");

export type BroadcastMessageRow = {
  id: string;
  authorUid: string;
  lat: number;
  lng: number;
  body: string;
  createdAt: string;
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

function retentionMs(): number {
  const h = Number(process.env.MAP_BROADCAST_RETENTION_HOURS);
  const hours = Number.isFinite(h) && h > 0 ? h : MAP_BROADCAST_RETENTION_HOURS;
  return hours * 60 * 60 * 1000;
}

function radiusMi(): number {
  const n = Number(process.env.MAP_NEARBY_RADIUS_MI);
  return Number.isFinite(n) && n > 0 ? n : MAP_NEARBY_RADIUS_MI;
}

function readRaw(): BroadcastMessageRow[] {
  try {
    if (!existsSync(DATA_PATH)) return [];
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((r) => normaliseRow(r))
      .filter((r): r is BroadcastMessageRow => r != null);
  } catch {
    return [];
  }
}

function writeRaw(list: BroadcastMessageRow[]): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(list, null, 2), "utf-8");
}

function pruneOld(list: BroadcastMessageRow[], now: Date): BroadcastMessageRow[] {
  const cutoff = now.getTime() - retentionMs();
  return list.filter((m) => new Date(m.createdAt).getTime() >= cutoff);
}

function normaliseRow(row: unknown): BroadcastMessageRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Partial<BroadcastMessageRow> & { authorSessionId?: unknown };
  const id = typeof r.id === "string" ? r.id : "";
  const body = typeof r.body === "string" ? r.body : "";
  const createdAt = typeof r.createdAt === "string" ? r.createdAt : "";
  const lat = typeof r.lat === "number" ? r.lat : Number(r.lat);
  const lng = typeof r.lng === "number" ? r.lng : Number(r.lng);
  const authorUid =
    typeof r.authorUid === "string"
      ? r.authorUid
      : typeof r.authorSessionId === "string"
        ? r.authorSessionId
        : "";

  if (!id || !authorUid || !Number.isFinite(lat) || !Number.isFinite(lng) || !createdAt) return null;
  return { id, authorUid, lat, lng, body, createdAt };
}

export type BroadcastMessagePublic = {
  id: string;
  lat: number;
  lng: number;
  body: string;
  createdAt: string;
  isMine: boolean;
  canDelete: boolean;
};

export async function listBroadcastsNear(
  lat: number,
  lng: number,
  viewerUid: string | null,
  viewerIsAdmin = false,
  now = new Date(),
): Promise<BroadcastMessagePublic[]> {
  return enqueue(async () => {
    const raw = readRaw();
    const pruned = pruneOld(raw, now);
    if (pruned.length !== raw.length) writeRaw(pruned);

    const maxMi = radiusMi();
    const out: BroadcastMessagePublic[] = [];
    for (const m of pruned) {
      if (distanceMiles(lat, lng, m.lat, m.lng) > maxMi) continue;
      out.push({
        id: m.id,
        lat: m.lat,
        lng: m.lng,
        body: m.body,
        createdAt: m.createdAt,
        isMine: viewerUid != null && m.authorUid === viewerUid,
        canDelete: viewerIsAdmin || (viewerUid != null && m.authorUid === viewerUid),
      });
    }
    out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return out;
  });
}

export async function appendBroadcast(
  authorUid: string,
  lat: number,
  lng: number,
  body: string,
  now = new Date(),
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  return enqueue(async () => {
    const list = pruneOld(readRaw(), now);
    const hourAgo = now.getTime() - 60 * 60 * 1000;
    const recent = list.filter(
      (m) => m.authorUid === authorUid && new Date(m.createdAt).getTime() >= hourAgo,
    );
    if (recent.length >= MAP_BROADCAST_RATE_PER_HOUR) {
      return { ok: false, error: "Rate limit: try again in a little while." };
    }

    const row: BroadcastMessageRow = {
      id: randomUUID(),
      authorUid,
      lat,
      lng,
      body,
      createdAt: now.toISOString(),
    };
    list.push(row);
    writeRaw(list);
    return { ok: true, id: row.id };
  });
}

export async function deleteBroadcast(
  id: string,
  requesterUid: string,
  requesterIsAdmin: boolean,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  return enqueue(async () => {
    const list = pruneOld(readRaw(), now);
    const idx = list.findIndex((m) => m.id === id);
    if (idx < 0) return { ok: false, error: "Not found" };
    const row = list[idx];
    if (!row) return { ok: false, error: "Not found" };
    if (!requesterIsAdmin && row.authorUid !== requesterUid) return { ok: false, error: "Not allowed" };
    const next = [...list.slice(0, idx), ...list.slice(idx + 1)];
    writeRaw(next);
    return { ok: true };
  });
}
