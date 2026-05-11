import { NextResponse } from "next/server";
import { requireAuthUser, type AuthUser } from "@/lib/auth";
import { anchorCommandsExposeServerErrors } from "@/lib/anchor-api-debug-server";
import { anchorCommandServerLog } from "@/lib/anchor-command-server-log";
import { ANCHOR_DEVICE_ID_HEADER } from "@/lib/anchor-device-id-header";
import { getEffectiveMonitorAndGeofence, getEffectiveMonitorDeviceIdForUid } from "@/lib/anchor-effective-monitor-server";
import { buildAnchorSessionFingerprint } from "@/lib/anchor-session-fingerprint";
import {
  createAnchorSessionCommand,
  getAnchorSessionCommand,

  listQueuedCommandsForMonitorPoll,
  type AnchorSessionCommandRow,
  type AnchorSessionCommandType,
} from "@/lib/anchor-session-commands-store";
import { getAnchorGeofenceConfig } from "@/lib/anchor-geofence-store";
import { getAnchorMonitorConfig } from "@/lib/anchor-monitor-store";

export const runtime = "nodejs";
export const maxDuration = 5;
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseType(t: unknown): AnchorSessionCommandType | null {
  if (t === "INCREASE_RADIUS" || t === "RESET_ANCHOR" || t === "SILENCE_UNTIL_RESET") return t;
  return null;
}

const noStore = { "Cache-Control": "no-store" as const };

/** Plain JSON for `NextResponse.json` — avoids non-enumerable / odd Supabase row shapes breaking serialization. */
function toMonitorPollCommandJson(c: AnchorSessionCommandRow): Record<string, unknown> {
  return {
    id: String(c.id),
    type: c.type,
    meters: c.meters == null ? null : Number(c.meters),
    status: c.status,
    sourceDeviceId: String(c.sourceDeviceId),
    sessionId: c.sessionId == null ? null : String(c.sessionId),
    targetDeviceId: c.targetDeviceId == null ? null : String(c.targetDeviceId),
    errorMessage: c.errorMessage == null ? null : String(c.errorMessage),
    createdAt: String(c.createdAt),
    appliedAt: c.appliedAt == null ? null : String(c.appliedAt),
  };
}

function devErrorPayload(error: unknown, code: string): Record<string, unknown> {
  const base: Record<string, unknown> = { ok: false as const, error: code };
  if (!anchorCommandsExposeServerErrors()) return base;
  const e = error instanceof Error ? error : new Error(String(error));
  return { ...base, message: e.message, stack: e.stack };
}

function logAnchorCommandsGetError(args: {
  req: Request;
  role: string | null;
  uid: string | null;
  effectiveMonitorDeviceId?: string | null;
  activeSessionId?: string | null;
  error: unknown;
}): void {
  let urlParams: string | null = null;
  try {
    urlParams = new URL(args.req.url).search;
  } catch {
    urlParams = "(bad_url)";
  }
  const err = args.error;
  console.error("[ANCHOR COMMANDS GET ERROR]", {
    role: args.role,
    uid: args.uid,
    deviceId: args.req.headers.get(ANCHOR_DEVICE_ID_HEADER),
    effectiveMonitorDeviceId: args.effectiveMonitorDeviceId ?? null,
    activeSessionId: args.activeSessionId ?? null,
    commandQueryParams: urlParams,
    error: err,
    stack: err instanceof Error ? err.stack : undefined,
  });
}

/**
 * Monitor poll: authenticate, resolve effective monitor id, list queued commands.
 */
async function getMonitorPollJson(uid: string, req: Request, _reqStart: number): Promise<Record<string, unknown>> {
  const headerDevice = (req.headers.get(ANCHOR_DEVICE_ID_HEADER) ?? "").trim();
  let effective: string | null = null;

  try {
    const { effective: effResolved, geo: geoForLog, monitor } = await getEffectiveMonitorAndGeofence(uid);
    effective = effResolved;

    if (!headerDevice) {
      return { ok: true, commands: [], pollAccepted: false, serverEffectiveMonitorDeviceId: effective ?? null, reason: "missing_device_header" };
    }
    if (!effective) {
      return { ok: true, commands: [], pollAccepted: false, serverEffectiveMonitorDeviceId: null, reason: "no_effective_monitor_configured" };
    }
    if (headerDevice !== effective) {
      anchorCommandServerLog("monitor_poll_denied", {
        uid,
        headerDevice: headerDevice.slice(0, 8),
        effective,
        serverMonitor: monitor.monitorDeviceId,
        geofenceMonitor: geoForLog.monitorDeviceId,
      });
      return { ok: true, commands: [], pollAccepted: false, serverEffectiveMonitorDeviceId: effective, reason: "header_device_not_effective_monitor" };
    }

    const { rows, timedOut, lookupError } = await listQueuedCommandsForMonitorPoll(uid, effective);

    if (lookupError) {
      console.error("[MONITOR_LIST_QUEUE_FAILED]", lookupError.message);
      return { ok: true, commands: [], pollAccepted: true, serverEffectiveMonitorDeviceId: effective, reason: "queue_lookup_failed_but_nonfatal", error: lookupError.message };
    }

    if (timedOut) {
      return { ok: true, commands: [], pollAccepted: true, serverEffectiveMonitorDeviceId: effective, reason: "queue_lookup_failed_but_nonfatal", error: "query_timeout" };
    }

    const commandPayload = rows.map((c) => toMonitorPollCommandJson(c));

    return {
      ok: true,
      commands: commandPayload,
      pollAccepted: true,
      serverEffectiveMonitorDeviceId: effective,
      ...(rows.length === 0 ? { reason: "queue_empty" } : {}),
    };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[MONITOR POLL EXCEPTION]", err);
    logAnchorCommandsGetError({
      req,
      role: "monitor",
      uid,
      effectiveMonitorDeviceId: effective,
      activeSessionId: uid,
      error: e,
    });
    return {
      ok: true,
      commands: [],
      pollAccepted: false as const,
      serverEffectiveMonitorDeviceId: effective ?? null,
      reason: err.message,
      stack: err.stack ?? null,
      error: err.message,
      debugCode: "MONITOR_POLL_EXCEPTION",
    };
  }
}

/** GET: `?role=monitor` + device header → queued commands for the monitoring handset. `?id=` → single command (owner). */
export async function GET(req: Request): Promise<Response> {
  const reqStart = Date.now();
  let role: string | null = null;
  let uid: string | null = null;

  try {
    const url = new URL(req.url);
    role = url.searchParams.get("role");

    const u: AuthUser | null = await requireAuthUser().catch(() => null);
    if (!u?.uid || typeof u.uid !== "string") {
      return NextResponse.json(
        { ok: false, error: "Sign-in required", code: "AUTH_REQUIRED" },
        { status: 401, headers: noStore },
      );
    }
    uid = u.uid;

    const id = url.searchParams.get("id");
    if (id?.trim()) {
      try {
        const row = await getAnchorSessionCommand(u.uid, id.trim());
        if (!row) {
          return NextResponse.json({ ok: false, error: "Not found", code: "NOT_FOUND" }, { status: 404, headers: noStore });
        }
        return NextResponse.json({ ok: true, command: row }, { headers: noStore });
      } catch (error) {
        logAnchorCommandsGetError({ req, role: "id", uid, error });
        return NextResponse.json(devErrorPayload(error, "anchor_commands_get_by_id_failed"), {
          status: 500,
          headers: noStore,
        });
      }
    }

    if (role === "monitor") {
      if (process.env.ANCHOR_MONITOR_POLL_EMPTY === "1") {
        return NextResponse.json(
          { ok: true, commands: [], pollAccepted: false, serverEffectiveMonitorDeviceId: null, reason: "hardcoded_empty" },
          { status: 200, headers: noStore },
        );
      }
      const body = await getMonitorPollJson(u.uid, req, reqStart);
      return NextResponse.json(body, { status: 200, headers: noStore });
    }

    return NextResponse.json(
      { ok: false, error: "Use ?role=monitor or ?id=", code: "BAD_QUERY" },
      { status: 400, headers: noStore },
    );
  } catch (error) {
    logAnchorCommandsGetError({ req, role, uid, error });

    if (role === "monitor") {
      const outerErr = error instanceof Error ? error : new Error(String(error));
      console.error("[MONITOR POLL OUTER EXCEPTION]", outerErr);
      return NextResponse.json(
        {
          ok: true,
          commands: [],
          pollAccepted: false,
          serverEffectiveMonitorDeviceId: null,
          reason: outerErr.message,
          stack: outerErr.stack ?? null,
          error: outerErr.message,
          debugCode: "MONITOR_POLL_OUTER_EXCEPTION",
        },
        { status: 200, headers: noStore },
      );
    }

    return NextResponse.json(devErrorPayload(error, "anchor_commands_get_failed"), { status: 500, headers: noStore });
  }
}

export async function POST(req: Request): Promise<Response> {
  let uid: string | null = null;
  try {
    const u = await requireAuthUser().catch(() => null);
    if (!u?.uid) {
      return NextResponse.json({ ok: false, error: "Sign-in required", code: "AUTH_REQUIRED" }, { status: 401 });
    }
    uid = u.uid;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON", code: "BAD_JSON" }, { status: 400 });
    }

    const type = parseType(body.type);
    if (!type) return NextResponse.json({ ok: false, error: "Invalid type", code: "BAD_TYPE" }, { status: 400 });

    if ("targetDeviceId" in body || "sessionId" in body) {
      return NextResponse.json(
        {
          ok: false,
          error: "Do not send targetDeviceId or sessionId — the server resolves those.",
          code: "CLIENT_SESSION_FIELDS_FORBIDDEN",
        },
        { status: 400 },
      );
    }

    const sourceDeviceId = (req.headers.get(ANCHOR_DEVICE_ID_HEADER) ?? "").trim();
    if (!sourceDeviceId) {
      return NextResponse.json(
        { ok: false, error: "Device header required (same as monitor poll).", code: "NO_SOURCE_DEVICE" },
        { status: 400 },
      );
    }

    const { effective, geo } = await getEffectiveMonitorAndGeofence(u.uid);
    if (!effective) {
      return NextResponse.json(
        { ok: false, error: "No monitoring device configured for this account.", code: "NO_EFFECTIVE_MONITOR" },
        { status: 400 },
      );
    }
    if (sourceDeviceId === effective) {
      return NextResponse.json(
        { ok: false, error: "Monitoring handset must apply commands locally, not enqueue them here.", code: "MONITOR_CANNOT_ENQUEUE" },
        { status: 400 },
      );
    }

    const sessionId = buildAnchorSessionFingerprint(u.uid, geo);
    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: "No armed anchor session (arm geofence on the monitoring flow first).", code: "NO_ACTIVE_SESSION" },
        { status: 400 },
      );
    }

    let meters: number | null = null;
    if (type === "INCREASE_RADIUS") {
      const m = body.meters;
      if (typeof m !== "number" || !Number.isFinite(m) || m <= 0 || m > 500) {
        return NextResponse.json({ ok: false, error: "meters must be a number 1–500", code: "BAD_METERS" }, { status: 400 });
      }
      meters = Math.round(m);
    }

    const row = await createAnchorSessionCommand({
      uid: u.uid,
      type,
      meters,
      sourceDeviceId,
      sessionId,
      targetDeviceId: effective,
    });

    anchorCommandServerLog("command_post_created", {
      uid: u.uid,
      id: row.id,
      type,
      sourceDeviceId,
      effectiveMonitor: effective,
      sessionId,
    });

    return NextResponse.json(
      {
        ok: true as const,
        command: row,
        sessionId: row.sessionId,
        targetDeviceId: row.targetDeviceId,
        status: row.status,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[ANCHOR COMMANDS POST ERROR]", {
      role: "post_create",
      uid,
      deviceId: req.headers.get(ANCHOR_DEVICE_ID_HEADER),
      error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(devErrorPayload(error, "anchor_commands_post_failed"), { status: 500, headers: noStore });
  }
}
