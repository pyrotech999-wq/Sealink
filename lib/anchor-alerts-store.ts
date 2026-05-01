import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DATA_PATH = path.join(process.cwd(), "data", "anchor-alerts.json");

export type AnchorAlertRow = {
  id: string;
  uid: string;
  createdAt: string;
  message: string;
  seenAt: string | null;
  kind: "alert" | "warning";
  expiresAt: string | null;
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

function readRaw(): AnchorAlertRow[] {
  try {
    if (!existsSync(DATA_PATH)) return [];
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as AnchorAlertRow[];
  } catch {
    return [];
  }
}

function writeRaw(list: AnchorAlertRow[]): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(list, null, 2), "utf-8");
}

function prune(list: AnchorAlertRow[], now = new Date()): AnchorAlertRow[] {
  const nowMs = now.getTime();
  const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
  return list.filter((r) => {
    const createdOk = new Date(r.createdAt).getTime() >= cutoff;
    if (!createdOk) return false;
    if (r.expiresAt) {
      const exp = new Date(r.expiresAt).getTime();
      if (Number.isFinite(exp) && exp <= nowMs) return false;
    }
    return true;
  });
}

async function pruneAnchorAlertsSupabase(now = new Date()): Promise<void> {
  const sb = supabaseAdmin();
  const nowIso = now.toISOString();
  const createdCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await sb.from("anchor_alerts").delete().lt("created_at", createdCutoff);
  await sb.from("anchor_alerts").delete().lt("expires_at", nowIso);
}

function mapAlertRow(r: Record<string, unknown>): AnchorAlertRow {
  return {
    id: String(r.id ?? ""),
    uid: String(r.user_uid ?? r.uid ?? ""),
    createdAt: String(r.created_at ?? r.createdAt ?? ""),
    message: String(r.message ?? ""),
    seenAt: r.seen_at != null ? String(r.seen_at) : r.seenAt != null ? String(r.seenAt) : null,
    kind: r.kind === "warning" ? "warning" : "alert",
    expiresAt: r.expires_at != null ? String(r.expires_at) : r.expiresAt != null ? String(r.expiresAt) : null,
  };
}

export async function createAnchorAlert(
  uid: string,
  message: string,
  opts?: { kind?: "alert" | "warning"; ttlMs?: number },
): Promise<AnchorAlertRow> {
  return enqueue(async () => {
    const now = new Date();
    const ttlMs = typeof opts?.ttlMs === "number" && Number.isFinite(opts.ttlMs) && opts.ttlMs > 0 ? opts.ttlMs : null;
    const row: AnchorAlertRow = {
      id: randomUUID(),
      uid,
      createdAt: now.toISOString(),
      message: message.trim().slice(0, 500),
      seenAt: null,
      kind: opts?.kind === "warning" ? "warning" : "alert",
      expiresAt: ttlMs ? new Date(now.getTime() + ttlMs).toISOString() : null,
    };

    if (isSupabaseConfigured()) {
      await pruneAnchorAlertsSupabase(now);
      const sb = supabaseAdmin();
      const { error } = await sb.from("anchor_alerts").insert({
        id: row.id,
        user_uid: uid,
        created_at: row.createdAt,
        message: row.message,
        seen_at: null,
        kind: row.kind,
        expires_at: row.expiresAt,
      });
      if (error) throw new Error(error.message);
      return row;
    }

    const list = prune(readRaw(), now);
    list.push(row);
    writeRaw(list);
    return row;
  });
}

export async function listUnseenAnchorAlerts(uid: string): Promise<AnchorAlertRow[]> {
  return enqueue(async () => {
    const now = new Date();
    if (isSupabaseConfigured()) {
      await pruneAnchorAlertsSupabase(now);
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("anchor_alerts")
        .select("*")
        .eq("user_uid", uid)
        .is("seen_at", null)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      const nowMs = now.getTime();
      return (data ?? [])
        .map((x) => mapAlertRow(x as Record<string, unknown>))
        .filter((r) => {
          if (!r.expiresAt) return true;
          const exp = new Date(r.expiresAt).getTime();
          return !Number.isFinite(exp) || exp > nowMs;
        });
    }

    const list = prune(readRaw(), now);
    writeRaw(list);
    return list.filter((r) => r.uid === uid && !r.seenAt).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });
}

export async function markAnchorAlertSeen(uid: string, id: string): Promise<boolean> {
  return enqueue(async () => {
    const now = new Date();
    if (isSupabaseConfigured()) {
      await pruneAnchorAlertsSupabase(now);
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("anchor_alerts")
        .update({ seen_at: now.toISOString() })
        .eq("user_uid", uid)
        .eq("id", id)
        .is("seen_at", null)
        .select("id");
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length > 0;
    }

    const list = prune(readRaw(), now);
    const idx = list.findIndex((r) => r.uid === uid && r.id === id);
    if (idx < 0) return false;
    const row = list[idx]!;
    if (!row.seenAt) row.seenAt = now.toISOString();
    writeRaw(list);
    return true;
  });
}

