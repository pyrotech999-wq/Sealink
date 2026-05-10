import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DATA_PATH = path.join(process.cwd(), "data", "anchor-devices.json");
const STALE_MS = 45 * 24 * 60 * 60 * 1000;

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
  const cutoff = now.getTime() - STALE_MS;
  return list.filter((r) => new Date(r.updatedAt).getTime() >= cutoff);
}

async function pruneStaleAnchorDevicesSupabase(): Promise<void> {
  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  await sb.from("anchor_devices").delete().lt("updated_at", cutoff);
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapAnchorDeviceRow(r: Record<string, unknown>): AnchorDeviceRow {
  return {
    uid: String(r.user_uid ?? r.uid ?? ""),
    deviceId: String(r.device_id ?? r.deviceId ?? ""),
    name: String(r.name ?? ""),
    updatedAt: String(r.updated_at ?? r.updatedAt ?? new Date().toISOString()),
    lastLat: numOrNull(r.last_lat ?? r.lastLat),
    lastLng: numOrNull(r.last_lng ?? r.lastLng),
    lastFixAt:
      r.last_fix_at != null
        ? String(r.last_fix_at)
        : r.lastFixAt != null
          ? String(r.lastFixAt)
          : null,
  };
}

export async function upsertAnchorDevice(
  uid: string,
  deviceId: string,
  patch: Partial<Pick<AnchorDeviceRow, "name" | "lastLat" | "lastLng" | "lastFixAt">>,
): Promise<void> {
  return enqueue(async () => {
    const now = new Date();
    if (isSupabaseConfigured()) {
      await pruneStaleAnchorDevicesSupabase();
      const sb = supabaseAdmin();
      const { data: existing } = await sb
        .from("anchor_devices")
        .select("*")
        .eq("user_uid", uid)
        .eq("device_id", deviceId)
        .maybeSingle();
      const ex = existing ? mapAnchorDeviceRow(existing as Record<string, unknown>) : null;
      const patchName =
        typeof patch.name === "string" && patch.name.trim() ? patch.name.trim().slice(0, 40) : null;
      const prevName = ex?.name?.trim() ? ex.name.trim().slice(0, 40) : null;
      const next: AnchorDeviceRow = {
        uid,
        deviceId,
        name: patchName ?? prevName ?? "This device",
        updatedAt: now.toISOString(),
        lastLat: typeof patch.lastLat === "number" ? patch.lastLat : ex?.lastLat ?? null,
        lastLng: typeof patch.lastLng === "number" ? patch.lastLng : ex?.lastLng ?? null,
        lastFixAt: typeof patch.lastFixAt === "string" ? patch.lastFixAt : ex?.lastFixAt ?? null,
      };
      const { error } = await sb.from("anchor_devices").upsert(
        {
          user_uid: uid,
          device_id: deviceId,
          name: next.name,
          updated_at: next.updatedAt,
          last_lat: next.lastLat,
          last_lng: next.lastLng,
          last_fix_at: next.lastFixAt,
        },
        { onConflict: "user_uid,device_id" },
      );
      if (error) throw new Error(error.message);
      return;
    }

    const full = readRaw();
    const raw = prune(full, now);
    if (raw.length !== full.length) writeRaw(raw);
    const idx = raw.findIndex((r) => r.uid === uid && r.deviceId === deviceId);
    const patchName =
      typeof patch.name === "string" && patch.name.trim() ? patch.name.trim().slice(0, 40) : null;
    const prevRow = idx >= 0 ? raw[idx]! : null;
    const prevName = prevRow?.name?.trim() ? prevRow.name.trim().slice(0, 40) : null;
    const next: AnchorDeviceRow = {
      uid,
      deviceId,
      name: patchName ?? prevName ?? "This device",
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
    if (isSupabaseConfigured()) {
      await pruneStaleAnchorDevicesSupabase();
      const sb = supabaseAdmin();
      const { data, error } = await sb.from("anchor_devices").select("*").eq("user_uid", uid);
      if (error) throw new Error(error.message);
      return (data ?? [])
        .map((row) => mapAnchorDeviceRow(row as Record<string, unknown>))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    const now = new Date();
    const full = readRaw();
    const raw = prune(full, now);
    if (raw.length !== full.length) writeRaw(raw);
    return raw.filter((r) => r.uid === uid).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });
}

