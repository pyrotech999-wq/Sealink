import { NextResponse } from "next/server";
import { requireAuthUser, type AuthUser } from "@/lib/auth";
import { anchorCommandsExposeServerErrors } from "@/lib/anchor-api-debug-server";
import { anchorCommandServerLog } from "@/lib/anchor-command-server-log";
import { ANCHOR_DEVICE_ID_HEADER } from "@/lib/anchor-device-id-header";
import { getEffectiveMonitorDeviceIdForUid } from "@/lib/anchor-effective-monitor-server";
import {
  createAnchorSessionCommand,
  getAnchorSessionCommand,
  listPendingAnchorSessionCommandsForUid,
  listQueuedAnchorSessionCommands,
  type AnchorSessionCommandType,
} from "@/lib/anchor-session-commands-store";
import { getAnchorGeofenceConfig } from "@/lib/anchor-geofence-store";
import { getAnchorMonitorConfig } from "@/lib/anchor-monitor-store";

export const runtime = "nodejs";

function parseType(t: unknown): AnchorSessionCommandType | null {
  if (t === "INCREASE_RADIUS" || t === "RESET_ANCHOR" || t === "SILENCE_UNTIL_RESET") return t;
  return null;
}

const noStore = { "Cache-Control": "no-store" as const };

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
 * Monitor poll must never return HTTP 500: clients treat non-2xx as hard failures.
 * On any server/DB error, return 200 + `ok: true` + empty `commands`, `pollAccepted: false`, and `reason`.
 */
async function getMonitorPollJson(uid: string, req: Request): Promise<Record<string, unknown>> {
  const headerDevice = (req.headers.get(ANCHOR_DEVICE_ID_HEADER) ?? "").trim();
  let activeSessionFingerprint: string | null = null;
  let effective: string | null = null;

  try {
    effective = await getEffectiveMonitorDeviceIdForUid(uid);
    let geoForLog: Awaited<ReturnType<typeof getAnchorGeofenceConfig>>;
    try {
      geoForLog = await getAnchorGeofenceConfig(uid);
    } catch (geoErr) {
      logAnchorCommandsGetError({
        req,
        role: "monitor",
        uid,
        effectiveMonitorDeviceId: effective,
        activeSessionId: null,
        error: geoErr,
      });
      geoForLog = {
        uid,
        armed: false,
        lat: null,
        lng: null,
        radiusM: 20,
        angleDeg: 360,
        monitorDeviceId: "this",
        lastBearingDeg: null,
        lastAlertAt: null,
        remoteAlarmSilencedUntilReset: false,
        updatedAt: new Date().toISOString(),
      };
    }

    activeSessionFingerprint = `${uid}|armed=${geoForLog.armed}|r=${geoForLog.radiusM}|mon_geo=${geoForLog.monitorDeviceId ?? "null"}|la=${geoForLog.lastAlertAt ?? "null"}`;
    const pollAccepted = Boolean(effective && headerDevice && headerDevice === effective);
    const match = Boolean(effective && headerDevice && headerDevice === effective);

    console.warn(
      "[ANCHOR_MONITOR_POLL_SRV]",
      JSON.stringify({
        uid,
        headerDeviceId: headerDevice || null,
        effectiveMonitorDeviceId: effective ?? null,
        match,
        activeSessionFingerprint,
        pollAccepted,
      }),
    );

    if (!headerDevice) {
      return {
        ok: true,
        commands: [],
        pollAccepted: false as const,
        serverEffectiveMonitorDeviceId: effective ?? null,
        reason: "missing_device_header",
      };
    }
    if (!effective) {
      return {
        ok: true,
        commands: [],
        pollAccepted: false as const,
        serverEffectiveMonitorDeviceId: null,
        reason: "no_effective_monitor_configured",
      };
    }
    if (headerDevice !== effective) {
      let mon: Awaited<ReturnType<typeof getAnchorMonitorConfig>>;
      try {
        mon = await getAnchorMonitorConfig(uid);
      } catch {
        mon = { uid, monitorDeviceId: null, alertDeviceIds: [], updatedAt: new Date().toISOString() };
      }
      anchorCommandServerLog("monitor_poll_denied", {
        uid,
        headerDevice: headerDevice ? `${headerDevice.slice(0, 8)}…` : "",
        effective: effective ?? null,
        serverMonitor: mon.monitorDeviceId,
        geofenceMonitor: geoForLog.monitorDeviceId,
      });
      console.warn(
        "[ANCHOR_MONITOR_POLL_SRV]",
        JSON.stringify({
          phase: "denied",
          uid,
          commandsQueuedFound: 0,
          commandsReturned: 0,
          serverEffectiveMonitorDeviceId: effective ?? null,
        }),
      );
      return {
        ok: true,
        commands: [],
        pollAccepted: false as const,
        serverEffectiveMonitorDeviceId: effective ?? null,
        reason: "header_device_not_effective_monitor",
      };
    }

    let commands: Awaited<ReturnType<typeof listQueuedAnchorSessionCommands>> = [];
    try {
      commands = await listQueuedAnchorSessionCommands(uid);
    } catch (listErr) {
      logAnchorCommandsGetError({
        req,
        role: "monitor",
        uid,
        effectiveMonitorDeviceId: effective,
        activeSessionId: activeSessionFingerprint,
        error: listErr,
      });
      return {
        ok: true,
        commands: [],
        pollAccepted: false as const,
        serverEffectiveMonitorDeviceId: effective ?? null,
        reason: "list_queued_commands_failed",
        error: "Could not load command queue.",
        debugCode: "MONITOR_LIST_QUEUE_FAILED",
      };
    }

    anchorCommandServerLog("monitor_poll_ok", { uid, count: commands.length, ids: commands.map((c) => c.id) });
    console.warn(
      "[ANCHOR_MONITOR_POLL_SRV]",
      JSON.stringify({
        phase: "ok",
        uid,
        commandsQueuedFound: commands.length,
        commandsReturned: commands.length,
        serverEffectiveMonitorDeviceId: effective ?? null,
        commands: commands.map((c) => ({
          id: c.id,
          type: c.type,
          status: c.status,
          meters: c.meters,
          sourceDeviceId: c.sourceDeviceId,
        })),
      }),
    );

    return {
      ok: true,
      commands,
      pollAccepted: true as const,
      serverEffectiveMonitorDeviceId: effective ?? null,
      ...(commands.length === 0 ? { reason: "queue_empty" } : {}),
    };
  } catch (e) {
    logAnchorCommandsGetError({
      req,
      role: "monitor",
      uid,
      effectiveMonitorDeviceId: effective,
      activeSessionId: activeSessionFingerprint,
      error: e,
    });
    return {
      ok: true,
      commands: [],
      pollAccepted: false as const,
      serverEffectiveMonitorDeviceId: null,
      reason: "monitor_poll_exception",
      error: "Monitor poll failed safely.",
      debugCode: "MONITOR_POLL_EXCEPTION",
    };
  }
}

/** GET: `?role=monitor` + device header → queued commands for the monitoring handset. `?id=` → single command (owner). */
export async function GET(req: Request): Promise<Response> {
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
        const status = anchorCommandsExposeServerErrors() ? 500 : 500;
        return NextResponse.json(devErrorPayload(error, "anchor_commands_get_by_id_failed"), {
          status,
          headers: noStore,
        });
      }
    }

    if (role === "monitor") {
      const body = await getMonitorPollJson(u.uid, req);
      return NextResponse.json(body, { status: 200, headers: noStore });
    }

    if (role === "diagnostics") {
      try {
        const effective = await getEffectiveMonitorDeviceIdForUid(u.uid);
        const [mon, geo, pending] = await Promise.all([
          getAnchorMonitorConfig(u.uid),
          getAnchorGeofenceConfig(u.uid),
          listPendingAnchorSessionCommandsForUid(u.uid),
        ]);
        anchorCommandServerLog("diagnostics_snapshot", { uid: u.uid, pending: pending.length });
        return NextResponse.json(
          {
            ok: true,
            effectiveMonitorDeviceId: effective,
            serverMonitorDeviceId: mon.monitorDeviceId,
            geofenceMonitorDeviceId: geo.monitorDeviceId,
            geofenceArmed: geo.armed,
            pendingCommands: pending,
            transport: "http_poll" as const,
            note:
              "Commands use HTTP polling on the boat (no Supabase Realtime channel). Background browser tabs may throttle timers; use visibility + shorter intervals while armed.",
          },
          { headers: noStore },
        );
      } catch (error) {
        logAnchorCommandsGetError({ req, role: "diagnostics", uid, error });
        return NextResponse.json(devErrorPayload(error, "anchor_commands_get_diagnostics_failed"), {
          status: 500,
          headers: noStore,
        });
      }
    }

    return NextResponse.json(
      { ok: false, error: "Use ?role=monitor, ?role=diagnostics, or ?id=", code: "BAD_QUERY" },
      { status: 400, headers: noStore },
    );
  } catch (error) {
    logAnchorCommandsGetError({ req, role, uid, error });

    if (role === "monitor") {
      return NextResponse.json(
        {
          ok: true,
          commands: [],
          pollAccepted: false,
          serverEffectiveMonitorDeviceId: null,
          reason: "outer_get_exception",
          error: "Monitor poll failed safely.",
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

    const sourceDeviceId =
      typeof body.sourceDeviceId === "string" && body.sourceDeviceId.trim()
        ? body.sourceDeviceId.trim()
        : req.headers.get(ANCHOR_DEVICE_ID_HEADER)?.trim() || "";
    if (!sourceDeviceId) {
      return NextResponse.json({ ok: false, error: "sourceDeviceId required", code: "NO_SOURCE_DEVICE" }, { status: 400 });
    }

    const effective = await getEffectiveMonitorDeviceIdForUid(u.uid);
    if (effective && sourceDeviceId === effective) {
      return NextResponse.json(
        { ok: false, error: "Monitoring handset must apply commands locally, not enqueue them here.", code: "MONITOR_CANNOT_ENQUEUE" },
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
    });

    const eff = await getEffectiveMonitorDeviceIdForUid(u.uid);
    anchorCommandServerLog("command_post_created", {
      uid: u.uid,
      id: row.id,
      type,
      sourceDeviceId,
      effectiveMonitor: eff ?? null,
    });

    return NextResponse.json({ ok: true, command: row }, { headers: { "Cache-Control": "no-store" } });
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
