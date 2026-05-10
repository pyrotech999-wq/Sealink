import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { anchorCommandServerLog } from "@/lib/anchor-command-server-log";
import {
  ANCHOR_COMMAND_STALE_BOAT_ERROR,
  ANCHOR_COMMAND_STALE_QUEUED_MS,
  ANCHOR_COMMAND_STALE_RECEIVED_MS,
} from "@/lib/anchor-command-constants";

const DATA_PATH = path.join(process.cwd(), "data", "anchor-session-commands.json");

export {
  ANCHOR_COMMAND_STALE_BOAT_ERROR,
  ANCHOR_COMMAND_STALE_QUEUED_MS,
  ANCHOR_COMMAND_STALE_RECEIVED_MS,
} from "@/lib/anchor-command-constants";

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

function mapRowDb(uid: string, r: Record<string, unknown>): AnchorSessionCommandRow | null {
  const id = r.id != null ? String(r.id).trim() : "";
  if (!id) return null;
  const ct = r.command_type;
  if (ct !== "INCREASE_RADIUS" && ct !== "RESET_ANCHOR" && ct !== "SILENCE_UNTIL_RESET") return null;
  const st = r.status;
  if (st !== "queued" && st !== "received" && st !== "applied" && st !== "failed") return null;
  return {
    id,
    userUid: uid,
    type: ct as AnchorSessionCommandType,
    meters: typeof r.meters === "number" && Number.isFinite(r.meters) ? Math.round(r.meters as number) : null,
    status: st as AnchorSessionCommandStatus,
    sourceDeviceId: String(r.source_device_id ?? "").trim().slice(0, 80),
    errorMessage: r.error_message != null ? String(r.error_message) : null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    appliedAt: r.applied_at != null ? String(r.applied_at) : null,
  };
}

/** Run inside store `enqueue` only. Marks stale queued/received rows as failed. */
async function expireStaleAnchorSessionCommands(uid: string, nowMs: number): Promise<{ queued: number; received: number }> {
  let nQueued = 0;
  let nReceived = 0;
  const nowIso = new Date(nowMs).toISOString();
  const qCut = new Date(nowMs - ANCHOR_COMMAND_STALE_QUEUED_MS).toISOString();
  const rCut = new Date(nowMs - ANCHOR_COMMAND_STALE_RECEIVED_MS).toISOString();

  try {
  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    const { data: dq, error: eq } = await sb
      .from("anchor_session_commands")
      .update({
        status: "failed",
        error_message: ANCHOR_COMMAND_STALE_BOAT_ERROR,
        applied_at: nowIso,
      })
      .eq("user_uid", uid)
      .eq("status", "queued")
      .lt("created_at", qCut)
      .select("id");
    if (eq) throw new Error(eq.message);
    nQueued = Array.isArray(dq) ? dq.length : 0;

    const { data: dr, error: er } = await sb
      .from("anchor_session_commands")
      .update({
        status: "failed",
        error_message: ANCHOR_COMMAND_STALE_BOAT_ERROR,
        applied_at: nowIso,
      })
      .eq("user_uid", uid)
      .eq("status", "received")
      .lt("created_at", rCut)
      .select("id");
    if (er) throw new Error(er.message);
    nReceived = Array.isArray(dr) ? dr.length : 0;
  } else {
    const list = readRaw();
    let dirty = false;
    for (const row of list) {
      if (row.userUid !== uid) continue;
      const created = new Date(row.createdAt).getTime();
      if (!Number.isFinite(created)) continue;
      if (row.status === "queued" && nowMs - created > ANCHOR_COMMAND_STALE_QUEUED_MS) {
        row.status = "failed";
        row.errorMessage = ANCHOR_COMMAND_STALE_BOAT_ERROR;
        row.appliedAt = nowIso;
        nQueued += 1;
        dirty = true;
      } else if (row.status === "received" && nowMs - created > ANCHOR_COMMAND_STALE_RECEIVED_MS) {
        row.status = "failed";
        row.errorMessage = ANCHOR_COMMAND_STALE_BOAT_ERROR;
        row.appliedAt = nowIso;
        nReceived += 1;
        dirty = true;
      }
    }
    if (dirty) writeRaw(list);
  }

  if (nQueued > 0 || nReceived > 0) {
    anchorCommandServerLog("commands_expired_stale", { uid, nQueued, nReceived });
  }
  return { queued: nQueued, received: nReceived };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[anchor_session_commands] expireStaleAnchorSessionCommands failed", { uid, msg });
    return { queued: 0, received: 0 };
  }
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

    anchorCommandServerLog("command_created", {
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

const MONITOR_POLL_LIST_MS = 2000;

/**
 * Read-only queue for HTTP monitor poll: **does not** use the global command-store mutex or stale expiry
 * (those stay on enqueue/create/patch paths). Uses `idx_anchor_session_commands_user_status_created`:
 * `user_uid`, `status` in (`queued`,`received`), `order created_at`, `LIMIT 10`, narrow `select`.
 * Fail-fast {@link MONITOR_POLL_LIST_MS} (returns `{ timedOut: true }` — route maps to `query_timeout`).
 */
export type MonitorPollListLookupError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export async function listQueuedCommandsForMonitorPoll(uid: string): Promise<{
  rows: AnchorSessionCommandRow[];
  timedOut: boolean;
  lookupError?: MonitorPollListLookupError | null;
}> {
  const queryShape = {
    table: "anchor_session_commands",
    sqlShape:
      "SELECT * FROM anchor_session_commands WHERE user_uid = $1 AND status IN ('queued','received') ORDER BY created_at ASC LIMIT 10",
    params: { user_uid: uid, status_in: ["queued", "received"] as const, limit: 10 },
  };

  if (!isSupabaseConfigured()) {
    try {
      const rows = readRaw()
        .filter((r) => r.userUid === uid && (r.status === "queued" || r.status === "received"))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(0, 10);
      return { rows, timedOut: false };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        rows: [],
        timedOut: false,
        lookupError: { message: err.message, details: "json_file_read_failed" },
      };
    }
  }

  const sb = supabaseAdmin();
  /** `select('*')` matches the enqueue path and avoids subtle column / projection mismatches with PostgREST. */
  const q = sb
    .from("anchor_session_commands")
    .select("*")
    .eq("user_uid", uid)
    .in("status", ["queued", "received"])
    .order("created_at", { ascending: true })
    .limit(10);

  const started = Date.now();
  try {
    const res = (await Promise.race([
      q,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("MONITOR_POLL_LIST_TIMEOUT")), MONITOR_POLL_LIST_MS);
      }),
    ])) as { data: unknown[] | null; error: { message: string; code?: string; details?: string; hint?: string } | null };

    if (res.error) {
      const le: MonitorPollListLookupError = {
        message: res.error.message,
        code: res.error.code,
        details: res.error.details,
        hint: res.error.hint,
      };
      return { rows: [], timedOut: false, lookupError: le };
    }

    const rows = (res.data ?? [])
      .map((x) => mapRowDb(uid, x as Record<string, unknown>))
      .filter((x): x is AnchorSessionCommandRow => x != null);
    return { rows, timedOut: false };
  } catch (e) {
    if (e instanceof Error && e.message === "MONITOR_POLL_LIST_TIMEOUT") {
      console.warn("[anchor_session_commands] listQueuedCommandsForMonitorPoll timeout", {
        uid,
        ms: Date.now() - started,
        query: queryShape,
      });
      return { rows: [], timedOut: true };
    }
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      rows: [],
      timedOut: false,
      lookupError: { message: err.message, details: err.stack },
    };
  }
}

/** Commands the monitoring handset should act on (`queued` or stuck `received` for retry). */
export async function listQueuedAnchorSessionCommands(uid: string): Promise<AnchorSessionCommandRow[]> {
  return enqueue(async () => {
    await expireStaleAnchorSessionCommands(uid, Date.now());

    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("anchor_session_commands")
        .select("*")
        .eq("user_uid", uid)
        .in("status", ["queued", "received"])
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? [])
        .map((x) => mapRowDb(uid, x as Record<string, unknown>))
        .filter((x): x is AnchorSessionCommandRow => x != null);
    }
    return readRaw()
      .filter((r) => r.userUid === uid && (r.status === "queued" || r.status === "received"))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });
}

/** Non-terminal commands for diagnostics (same user). */
export async function listPendingAnchorSessionCommandsForUid(uid: string): Promise<AnchorSessionCommandRow[]> {
  return enqueue(async () => {
    await expireStaleAnchorSessionCommands(uid, Date.now());
    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("anchor_session_commands")
        .select("*")
        .eq("user_uid", uid)
        .in("status", ["queued", "received"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? [])
        .map((x) => mapRowDb(uid, x as Record<string, unknown>))
        .filter((x): x is AnchorSessionCommandRow => x != null);
    }
    return readRaw()
      .filter((r) => r.userUid === uid && (r.status === "queued" || r.status === "received"))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
  });
}

export async function getAnchorSessionCommand(uid: string, id: string): Promise<AnchorSessionCommandRow | null> {
  return enqueue(async () => {
    await expireStaleAnchorSessionCommands(uid, Date.now());

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
    anchorCommandServerLog("command_status_update", {
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
