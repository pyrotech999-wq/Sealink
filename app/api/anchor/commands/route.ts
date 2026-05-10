import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
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

function monitorPollEmptyOk(body: {
  pollAccepted: boolean;
  serverEffectiveMonitorDeviceId: string | null;
  errorMessage?: string;
  debugCode?: string;
}): Response {
  return NextResponse.json(
    {
      ok: true as const,
      commands: [] as const,
      pollAccepted: body.pollAccepted,
      serverEffectiveMonitorDeviceId: body.serverEffectiveMonitorDeviceId,
      ...(body.errorMessage ? { errorMessage: body.errorMessage } : {}),
      ...(body.debugCode ? { debugCode: body.debugCode } : {}),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

/** GET: `?role=monitor` + device header → queued commands for the monitoring handset. `?id=` → single command (owner). */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  const idParam = url.searchParams.get("id");
  let uid: string | null = null;

  try {
    const u = await requireAuthUser().catch(() => null);
    if (!u?.uid || typeof u.uid !== "string" || !u.uid.trim()) {
      return NextResponse.json(
        { ok: false, error: "Sign-in required" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    uid = u.uid.trim();

    const headers = { "Cache-Control": "no-store" } as const;

    if (idParam?.trim()) {
      const row = await getAnchorSessionCommand(uid, idParam.trim());
      if (!row) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404, headers });
      }
      return NextResponse.json({ ok: true, command: row }, { headers });
    }

    if (role === "monitor") {
      const headerDevice = (req.headers.get(ANCHOR_DEVICE_ID_HEADER) ?? "").trim();

      let effective: string | null = null;
      try {
        effective = await getEffectiveMonitorDeviceIdForUid(uid);
      } catch (e) {
        console.warn("[ANCHOR_MONITOR_POLL_SRV] getEffectiveMonitorDeviceIdForUid failed", e);
        effective = null;
      }

      let geoForLog: Awaited<ReturnType<typeof getAnchorGeofenceConfig>> | null = null;
      try {
        geoForLog = await getAnchorGeofenceConfig(uid);
      } catch (e) {
        console.warn("[ANCHOR_MONITOR_POLL_SRV] getAnchorGeofenceConfig failed", e);
        geoForLog = null;
      }

      const armed = geoForLog?.armed === true;
      const radiusM =
        geoForLog && typeof geoForLog.radiusM === "number" && Number.isFinite(geoForLog.radiusM)
          ? geoForLog.radiusM
          : 0;
      const monGeo = geoForLog?.monitorDeviceId != null ? String(geoForLog.monitorDeviceId) : "null";
      const lastAlert = geoForLog?.lastAlertAt != null ? String(geoForLog.lastAlertAt) : "null";
      const activeSessionFingerprint = `${uid}|armed=${armed}|r=${radiusM}|mon_geo=${monGeo}|la=${lastAlert}`;

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
        let mon: Awaited<ReturnType<typeof getAnchorMonitorConfig>> | null = null;
        try {
          mon = await getAnchorMonitorConfig(uid);
        } catch (e) {
          console.warn("[ANCHOR_MONITOR_POLL_SRV] getAnchorMonitorConfig (denied branch) failed", e);
        }
        anchorCommandServerLog("monitor_poll_denied", {
          uid,
          headerDevice: headerDevice ? `${headerDevice.slice(0, 8)}…` : "",
          effective: effective ?? null,
          serverMonitor: mon?.monitorDeviceId ?? null,
          geofenceMonitor: geoForLog?.monitorDeviceId ?? null,
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
        return NextResponse.json(
          {
            ok: true as const,
            commands: [] as const,
            pollAccepted: false as const,
            serverEffectiveMonitorDeviceId: effective ?? null,
          },
          { headers },
        );
      }

      let commands: Awaited<ReturnType<typeof listQueuedAnchorSessionCommands>> = [];
      try {
        commands = await listQueuedAnchorSessionCommands(uid);
      } catch (e) {
        console.error("[ANCHOR_MONITOR_POLL_SRV] listQueuedAnchorSessionCommands failed", e);
        return monitorPollEmptyOk({
          pollAccepted: true,
          serverEffectiveMonitorDeviceId: effective,
          errorMessage: "Commands could not be loaded. Try again shortly.",
          debugCode: "ANCHOR_COMMANDS_LIST_FAIL",
        });
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
      return NextResponse.json(
        {
          ok: true as const,
          commands,
          pollAccepted: true as const,
          serverEffectiveMonitorDeviceId: effective ?? null,
        },
        { headers },
      );
    }

    if (role === "diagnostics") {
      const effective = await getEffectiveMonitorDeviceIdForUid(uid);
      const [mon, geo, pending] = await Promise.all([
        getAnchorMonitorConfig(uid),
        getAnchorGeofenceConfig(uid),
        listPendingAnchorSessionCommandsForUid(uid),
      ]);
      anchorCommandServerLog("diagnostics_snapshot", { uid, pending: pending.length });
      return NextResponse.json(
        {
          ok: true as const,
          effectiveMonitorDeviceId: effective,
          serverMonitorDeviceId: mon.monitorDeviceId,
          geofenceMonitorDeviceId: geo.monitorDeviceId,
          geofenceArmed: geo.armed,
          pendingCommands: pending,
          transport: "http_poll" as const,
          note:
            "Commands use HTTP polling on the boat (no Supabase Realtime channel). Background browser tabs may throttle timers; use visibility + shorter intervals while armed.",
        },
        { headers },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Use ?role=monitor, ?role=diagnostics, or ?id=" },
      { status: 400, headers },
    );
  } catch (error) {
    console.error("[ANCHOR COMMANDS GET ERROR]", {
      role,
      uid,
      deviceId: req.headers.get(ANCHOR_DEVICE_ID_HEADER),
      error,
    });
    if (role === "monitor") {
      return monitorPollEmptyOk({
        pollAccepted: false,
        serverEffectiveMonitorDeviceId: null,
        errorMessage: "Unable to complete anchor command poll. Try again shortly.",
        debugCode: "ANCHOR_COMMANDS_GET_MONITOR_FAIL",
      });
    }
    return NextResponse.json(
      {
        ok: false,
        errorMessage: "Request failed.",
        debugCode: "ANCHOR_COMMANDS_GET_FAIL",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
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
