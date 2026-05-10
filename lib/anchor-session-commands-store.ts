import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { anchorCommandServerLog } from "@/lib/anchor-command-server-log";

const DATA_PATH = path.join(process.cwd(), "data", "anchor-session-commands.json");

export type AnchorSessionCommandStatus = "queued" | "received" | "applied" | "failed";

export type AnchorSessionCommandType = "INCREASE_RADIUS" | "RESET_ANCHOR" | "SILENCE_UNTIL_RESET";

export type AnchorSessionCommandRow = {
  id: string;
  userUid: string;
  type: AnchorSessionCommandType;
  meters: number | null;
  status: AnchorSessionCommandStatus;
  sourceDeviceId: string;
  errorMessage: string | null;
  createdAt: string;
  appliedAt: string | null;
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

function readRaw(): AnchorSessionCommandRow[] {
  try {
    if (!existsSync(DATA_PATH)) return [];
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AnchorSessionCommandRow[]) : [];
  } catch {
    return [];
  }
}

function writeRaw(list: AnchorSessionCommandRow[]): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(list, null, 2), "utf-8");
}

function mapRowDb(uid: string, r: Record<string, unknown>): AnchorSessionCommandRow {
  return {
    id: String(r.id),
    userUid: uid,
    type: r.command_type as AnchorSessionCommandType,
    meters: typeof r.meters === "number" && Number.isFinite(r.meters) ? Math.round(r.meters as number) : null,
    status: r.status as AnchorSessionCommandStatus,
    sourceDeviceId: String(r.source_device_id ?? ""),
    errorMessage: r.error_message != null ? String(r.error_message) : null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    appliedAt: r.applied_at != null ? String(r.applied_at) : null,
  };
}

export async function createAnchorSessionCommand(args: {
  uid: string;
  type: AnchorSessionCommandType;
  meters?: number | null;
  sourceDeviceId: string;
}): Promise<AnchorSessionCommandRow> {
  return enqueue(async () => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const row: AnchorSessionCommandRow = {
      id,
      userUid: args.uid,
      type: args.type,
      meters:
        args.type === "INCREASE_RADIUS" && typeof args.meters === "number" && Number.isFinite(args.meters)
          ? Math.max(1, Math.min(500, Math.round(args.meters)))
          : null,
      status: "queued",
      sourceDeviceId: args.sourceDeviceId.trim().slice(0, 80),
      errorMessage: null,
      createdAt: now,
      appliedAt: null,
    };

    anchorCommandServerLog("created", {
      uid: args.uid,
      id,
      type: args.type,
      meters: row.meters,
      sourceDeviceId: row.sourceDeviceId,
    });

    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { error } = await sb.from("anchor_session_commands").insert({
        id: row.id,
        user_uid: args.uid,
        command_type: row.type,
        meters: row.meters,
        status: row.status,
        source_device_id: row.sourceDeviceId,
        error_message: null,
        created_at: row.createdAt,
        applied_at: null,
      });
      if (error) throw new Error(error.message);
      return row;
    }

    const list = readRaw();
    list.push(row);
    writeRaw(list);
    return row;
  });
}

export async function listQueuedAnchorSessionCommands(uid: string): Promise<AnchorSessionCommandRow[]> {
  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("anchor_session_commands")
        .select("*")
        .eq("user_uid", uid)
        .eq("status", "queued")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((x) => mapRowDb(uid, x as Record<string, unknown>));
    }
    return readRaw()
      .filter((r) => r.userUid === uid && r.status === "queued")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });
}

export async function getAnchorSessionCommand(uid: string, id: string): Promise<AnchorSessionCommandRow | null> {
  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("anchor_session_commands")
        .select("*")
        .eq("user_uid", uid)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return mapRowDb(uid, data as Record<string, unknown>);
    }
    return readRaw().find((r) => r.userUid === uid && r.id === id) ?? null;
  });
}

export async function updateAnchorSessionCommandStatus(args: {
  uid: string;
  id: string;
  status: AnchorSessionCommandStatus;
  errorMessage?: string | null;
}): Promise<AnchorSessionCommandRow | null> {
  return enqueue(async () => {
    const now = new Date().toISOString();
    anchorCommandServerLog("status_update", {
      uid: args.uid,
      id: args.id,
      status: args.status,
      error: args.errorMessage ?? null,
    });

    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const patch: Record<string, unknown> = { status: args.status };
      if (args.status === "applied" || args.status === "failed") {
        patch.applied_at = now;
      }
      if (args.errorMessage !== undefined) {
        patch.error_message = args.errorMessage;
      }
      const { data, error } = await sb
        .from("anchor_session_commands")
        .update(patch)
        .eq("user_uid", args.uid)
        .eq("id", args.id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return mapRowDb(args.uid, data as Record<string, unknown>);
    }

    const list = readRaw();
    const idx = list.findIndex((r) => r.userUid === args.uid && r.id === args.id);
    if (idx < 0) return null;
    const cur = list[idx]!;
    cur.status = args.status;
    if (args.errorMessage !== undefined) cur.errorMessage = args.errorMessage;
    if (args.status === "applied" || args.status === "failed") cur.appliedAt = now;
    list[idx] = cur;
    writeRaw(list);
    return cur;
  });
}
