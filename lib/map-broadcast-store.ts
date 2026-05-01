import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { distanceMiles } from "@/lib/geo-haversine";
import { canUseKv, kvGetJson, kvSetJson } from "@/lib/kv-json";
import {
  MAP_BROADCAST_RATE_PER_HOUR,
  MAP_BROADCAST_RETENTION_HOURS,
  MAP_MOB_BODY_MAX,
  MAP_MOB_RADIUS_MI,
  MAP_MOB_RATE_PER_HOUR,
} from "@/lib/map-broadcast-constants";
import { MAP_NEARBY_RADIUS_MI } from "@/lib/map-nearby-constants";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DATA_PATH = path.join(process.cwd(), "data", "map-broadcast-messages.json");
const KV_KEY = "sealink:map-broadcasts:v1";

export type BroadcastMessageRow = {
  id: string;
  authorUid: string;
  lat: number;
  lng: number;
  body: string;
  createdAt: string;
  /** When true, listed for all viewers (admin-only to create). */
  isGlobal: boolean;
  /** Man overboard: listed within {@link MAP_MOB_RADIUS_MI} mi for all signed-in map viewers. */
  isMob: boolean;
  /** Sender phone for MOB tel: link (digits / E.164). */
  mobPhone: string | null;
  /** Non-MOB message that still uses {@link MAP_MOB_RADIUS_MI} (e.g. MOB cancellation). */
  wideAreaReach: boolean;
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

function cutoffIso(now: Date): string {
  return new Date(now.getTime() - retentionMs()).toISOString();
}

function readRawFile(): BroadcastMessageRow[] {
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

function writeRawFile(list: BroadcastMessageRow[]): void {
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

  const isGlobal = r.isGlobal === true;
  const isMob = r.isMob === true || (r as { is_mob?: unknown }).is_mob === true;
  const mp =
    typeof r.mobPhone === "string"
      ? r.mobPhone
      : typeof (r as { mob_phone?: unknown }).mob_phone === "string"
        ? (r as { mob_phone: string }).mob_phone
        : "";
  const mobPhone = mp.trim().slice(0, 40) || null;
  const wideAreaReach =
    r.wideAreaReach === true || (r as { wide_area_reach?: unknown }).wide_area_reach === true;
  if (!id || !authorUid || !Number.isFinite(lat) || !Number.isFinite(lng) || !createdAt) return null;
  return { id, authorUid, lat, lng, body, createdAt, isGlobal, isMob, mobPhone, wideAreaReach };
}

function rowToPublic(
  m: BroadcastMessageRow,
  viewerUid: string | null,
  viewerIsAdmin: boolean,
): BroadcastMessagePublic {
  return {
    id: m.id,
    authorUid: m.authorUid,
    lat: m.lat,
    lng: m.lng,
    body: m.body,
    createdAt: m.createdAt,
    isGlobal: m.isGlobal,
    isMob: m.isMob,
    mobPhone: m.mobPhone,
    isMine: viewerUid != null && m.authorUid === viewerUid,
    canDelete: viewerIsAdmin || (viewerUid != null && m.authorUid === viewerUid),
  };
}

export type BroadcastMessagePublic = {
  id: string;
  /** Stable account id (sha256 slice); shown so signed-in users can reply in DM. */
  authorUid: string;
  lat: number;
  lng: number;
  body: string;
  createdAt: string;
  isGlobal: boolean;
  isMob: boolean;
  mobPhone: string | null;
  isMine: boolean;
  canDelete: boolean;
};

async function readRawUnified(now: Date): Promise<BroadcastMessageRow[]> {
  const cIso = cutoffIso(now);

  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    await sb.from("map_broadcasts").delete().lt("created_at", cIso);
    const { data, error } = await sb
      .from("map_broadcasts")
      .select("id, author_uid, lat, lng, body, created_at, is_global, is_mob, mob_phone, wide_area_reach")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => dbRowToInternal(row as Record<string, unknown>)).filter(Boolean) as BroadcastMessageRow[];
  }

  if (canUseKv()) {
    const raw = (await kvGetJson<unknown[]>(KV_KEY, [])) ?? [];
    const normalized = raw
      .map((r) => normaliseRow(r))
      .filter((r): r is BroadcastMessageRow => r != null);
    const pruned = pruneOld(normalized, now);
    if (pruned.length !== normalized.length) await kvSetJson(KV_KEY, pruned);
    return pruned;
  }

  const raw = readRawFile();
  const pruned = pruneOld(raw, now);
  if (pruned.length !== raw.length) writeRawFile(pruned);
  return pruned;
}

function dbRowToInternal(r: Record<string, unknown>): BroadcastMessageRow | null {
  const id = typeof r.id === "string" ? r.id : "";
  const authorUid = typeof r.author_uid === "string" ? r.author_uid : "";
  const body = typeof r.body === "string" ? r.body : "";
  const createdAt = typeof r.created_at === "string" ? r.created_at : "";
  const lat = typeof r.lat === "number" ? r.lat : Number(r.lat);
  const lng = typeof r.lng === "number" ? r.lng : Number(r.lng);
  const isGlobal = r.is_global === true;
  const isMob = r.is_mob === true;
  const mobRaw = typeof r.mob_phone === "string" ? r.mob_phone.trim().slice(0, 40) : "";
  const mobPhone = mobRaw.length > 0 ? mobRaw : null;
  const wideAreaReach = r.wide_area_reach === true;
  if (!id || !authorUid || !createdAt || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { id, authorUid, lat, lng, body, createdAt, isGlobal, isMob, mobPhone, wideAreaReach };
}

export async function listBroadcastsNear(
  lat: number,
  lng: number,
  viewerUid: string | null,
  viewerIsAdmin = false,
  now = new Date(),
): Promise<BroadcastMessagePublic[]> {
  return enqueue(async () => {
    const raw = await readRawUnified(now);

    const maxMi = radiusMi();
    const out: BroadcastMessagePublic[] = [];
    for (const m of raw) {
      if (m.isGlobal) {
        out.push(rowToPublic(m, viewerUid, viewerIsAdmin));
        continue;
      }
      const d = distanceMiles(lat, lng, m.lat, m.lng);
      const limitMi = m.isMob || m.wideAreaReach ? MAP_MOB_RADIUS_MI : maxMi;
      if (d > limitMi) continue;
      out.push(rowToPublic(m, viewerUid, viewerIsAdmin));
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
  opts: { isGlobal?: boolean; wideAreaReach?: boolean } = {},
  now = new Date(),
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const isGlobal = opts.isGlobal === true;
  const wideAreaReach = opts.wideAreaReach === true && !isGlobal;
  return enqueue(async () => {
    const hourAgo = now.getTime() - 60 * 60 * 1000;
    const hourAgoIso = new Date(hourAgo).toISOString();

    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const cIso = cutoffIso(now);
      await sb.from("map_broadcasts").delete().lt("created_at", cIso);

      const { count, error: cErr } = await sb
        .from("map_broadcasts")
        .select("id", { count: "exact", head: true })
        .eq("author_uid", authorUid)
        .gte("created_at", hourAgoIso);
      if (cErr) return { ok: false, error: cErr.message };
      if ((count ?? 0) >= MAP_BROADCAST_RATE_PER_HOUR) {
        return { ok: false, error: "Rate limit: try again in a little while." };
      }

      const { data, error } = await sb
        .from("map_broadcasts")
        .insert({
          author_uid: authorUid,
          lat,
          lng,
          body,
          is_global: isGlobal,
          wide_area_reach: wideAreaReach,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      const id = data && typeof (data as { id?: string }).id === "string" ? (data as { id: string }).id : "";
      if (!id) return { ok: false, error: "Insert failed" };
      return { ok: true, id };
    }

    const list = await readRawUnified(now);
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
      isGlobal,
      isMob: false,
      mobPhone: null,
      wideAreaReach,
    };
    const next = [...list, row];
    if (canUseKv()) await kvSetJson(KV_KEY, next);
    else writeRawFile(next);
    return { ok: true, id: row.id };
  });
}

export async function appendMobBroadcast(
  authorUid: string,
  lat: number,
  lng: number,
  body: string,
  mobPhone: string | null,
  now = new Date(),
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const text = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, MAP_MOB_BODY_MAX);
  if (text.length < 1) return { ok: false, error: "Message cannot be empty." };

  return enqueue(async () => {
    const hourAgo = now.getTime() - 60 * 60 * 1000;
    const hourAgoIso = new Date(hourAgo).toISOString();

    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const cIso = cutoffIso(now);
      await sb.from("map_broadcasts").delete().lt("created_at", cIso);

      const { count, error: cErr } = await sb
        .from("map_broadcasts")
        .select("id", { count: "exact", head: true })
        .eq("author_uid", authorUid)
        .eq("is_mob", true)
        .gte("created_at", hourAgoIso);
      if (cErr) return { ok: false, error: cErr.message };
      if ((count ?? 0) >= MAP_MOB_RATE_PER_HOUR) {
        return { ok: false, error: "MOB alert rate limit: try again in a little while." };
      }

      const phoneVal = mobPhone && mobPhone.trim() ? mobPhone.trim().slice(0, 40) : null;
      const { data, error } = await sb
        .from("map_broadcasts")
        .insert({
          author_uid: authorUid,
          lat,
          lng,
          body: text,
          is_global: false,
          is_mob: true,
          mob_phone: phoneVal,
          wide_area_reach: false,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      const id = data && typeof (data as { id?: string }).id === "string" ? (data as { id: string }).id : "";
      if (!id) return { ok: false, error: "Insert failed" };
      return { ok: true, id };
    }

    const list = await readRawUnified(now);
    const recentMob = list.filter(
      (m) =>
        m.authorUid === authorUid &&
        m.isMob &&
        new Date(m.createdAt).getTime() >= hourAgo,
    );
    if (recentMob.length >= MAP_MOB_RATE_PER_HOUR) {
      return { ok: false, error: "MOB alert rate limit: try again in a little while." };
    }

    const row: BroadcastMessageRow = {
      id: randomUUID(),
      authorUid,
      lat,
      lng,
      body: text,
      createdAt: now.toISOString(),
      isGlobal: false,
      isMob: true,
      mobPhone: mobPhone && mobPhone.trim() ? mobPhone.trim().slice(0, 40) : null,
      wideAreaReach: false,
    };
    const next = [...list, row];
    if (canUseKv()) await kvSetJson(KV_KEY, next);
    else writeRawFile(next);
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
    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const cIso = cutoffIso(now);
      await sb.from("map_broadcasts").delete().lt("created_at", cIso);

      const { data: row, error: fErr } = await sb
        .from("map_broadcasts")
        .select("author_uid")
        .eq("id", id)
        .maybeSingle();
      if (fErr) return { ok: false, error: fErr.message };
      const r = row as { author_uid?: string } | null;
      if (!r || typeof r.author_uid !== "string") return { ok: false, error: "Not found" };
      if (!requesterIsAdmin && r.author_uid !== requesterUid) return { ok: false, error: "Not allowed" };
      const { error: dErr } = await sb.from("map_broadcasts").delete().eq("id", id);
      if (dErr) return { ok: false, error: dErr.message };
      return { ok: true };
    }

    const list = await readRawUnified(now);
    const idx = list.findIndex((m) => m.id === id);
    if (idx < 0) return { ok: false, error: "Not found" };
    const row = list[idx];
    if (!row) return { ok: false, error: "Not found" };
    if (!requesterIsAdmin && row.authorUid !== requesterUid) return { ok: false, error: "Not allowed" };
    const next = [...list.slice(0, idx), ...list.slice(idx + 1)];
    if (canUseKv()) await kvSetJson(KV_KEY, next);
    else writeRawFile(next);
    return { ok: true };
  });
}
