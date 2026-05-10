import { NextResponse } from "next/server";
import { requireAuthUser, type AuthUser } from "@/lib/auth";
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

/**
 * Monitor poll must never return HTTP 500: clients treat non-2xx as hard failures.
 * On any server/DB error, return 200 + `ok: true` + empty `commands` and `pollAccepted: false`.
 */
async function getMonitorPollJson(uid: string, req: Request): Promise<Record<string, unknown>> {
  const headerDevice = (req.headers.get(ANCHOR_DEVICE_ID_HEADER) ?? "").trim();
  try {
    const effective = await getEffectiveMonitorDeviceIdForUid(uid);
    let geoForLog: Awaited<ReturnType<typeof getAnchorGeofenceConfig>>;
    try {
      geoForLog = await getAnchorGeofenceConfig(uid);
    } catch {
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

    const activeSessionFingerprint = `${uid}|armed=${geoForLog.armed}|r=${geoForLog.radiusM}|mon_geo=${geoForLog.monitorDeviceId ?? "null"}|la=${geoForLog.lastAlertAt ?? "null"}`;
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

    if (!pollAccepted) {
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
      };
    }

    let commands: Awaited<ReturnType<typeof listQueuedAnchorSessionCommands>> = [];
    try {
      commands = await listQueuedAnchorSessionCommands(uid);
    } catch (listErr) {
      console.error("[ANCHOR COMMANDS GET ERROR]", {
        role: "monitor",
        uid,
        deviceId: req.headers.get(ANCHOR_DEVICE_ID_HEADER),
        phase: "listQueued",
        error: listErr,
        stack: listErr instanceof Error ? listErr.stack : undefined,
      });
      return {
        ok: true,
        commands: [],
        pollAccepted: false as const,
        serverEffectiveMonitorDeviceId: effective ?? null,
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
    };
  } catch (e) {
    console.error("[ANCHOR COMMANDS GET ERROR]", {
      role: "monitor",
      uid,
      deviceId: req.headers.get(ANCHOR_DEVICE_ID_HEADER),
      error: e,
      stack: e instanceof Error ? e.stack : undefined,
    });
    return {
      ok: true,
      commands: [],
      pollAccepted: false as const,
      serverEffectiveMonitorDeviceId: null,
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
    if (!u?.uid) {
      return NextResponse.json(
        { ok: false, error: "Sign-in required", code: "AUTH_REQUIRED" },
        { status: 401, headers: noStore },
      );
    }
    uid = u.uid;

    const id = url.searchParams.get("id");
    if (id?.trim()) {
      const row = await getAnchorSessionCommand(u.uid, id.trim());
      if (!row) {
        return NextResponse.json({ ok: false, error: "Not found", code: "NOT_FOUND" }, { status: 404, headers: noStore });
      }
      return NextResponse.json({ ok: true, command: row }, { headers: noStore });
    }

    if (role === "monitor") {
      const body = await getMonitorPollJson(u.uid, req);
      return NextResponse.json(body, { status: 200, headers: noStore });
    }

    if (role === "diagnostics") {
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
    }

    return NextResponse.json(
      { ok: false, error: "Use ?role=monitor, ?role=diagnostics, or ?id=", code: "BAD_QUERY" },
      { status: 400, headers: noStore },
    );
  } catch (error) {
    console.error("[ANCHOR COMMANDS GET ERROR]", {
      role,
      uid,
      deviceId: req.headers.get(ANCHOR_DEVICE_ID_HEADER),
      error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (role === "monitor") {
      return NextResponse.json(
        {
          ok: true,
          commands: [],
          pollAccepted: false,
          serverEffectiveMonitorDeviceId: null,
          error: "Monitor poll failed safely.",
          debugCode: "MONITOR_POLL_OUTER_EXCEPTION",
        },
        { status: 200, headers: noStore },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Something went wrong.",
        code: "INTERNAL",
        debugCode: "ANCHOR_COMMANDS_GET",
      },
      { status: 500, headers: noStore },
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = parseType(body.type);
  if (!type) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  const sourceDeviceId =
    typeof body.sourceDeviceId === "string" && body.sourceDeviceId.trim()
      ? body.sourceDeviceId.trim()
      : req.headers.get(ANCHOR_DEVICE_ID_HEADER)?.trim() || "";
  if (!sourceDeviceId) return NextResponse.json({ error: "sourceDeviceId required" }, { status: 400 });

  const effective = await getEffectiveMonitorDeviceIdForUid(u.uid);
  if (effective && sourceDeviceId === effective) {
    return NextResponse.json(
      { error: "Monitoring handset must apply commands locally, not enqueue them here." },
      { status: 400 },
    );
  }

  let meters: number | null = null;
  if (type === "INCREASE_RADIUS") {
    const m = body.meters;
    if (typeof m !== "number" || !Number.isFinite(m) || m <= 0 || m > 500) {
      return NextResponse.json({ error: "meters must be a number 1–500" }, { status: 400 });
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

  return NextResponse.json({ command: row }, { headers: { "Cache-Control": "no-store" } });
}
