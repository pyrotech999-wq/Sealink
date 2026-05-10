import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { anchorCommandServerLog } from "@/lib/anchor-command-server-log";
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

const DEVICE_HEADER = "x-sealink-device-id";

function parseType(t: unknown): AnchorSessionCommandType | null {
  if (t === "INCREASE_RADIUS" || t === "RESET_ANCHOR" || t === "SILENCE_UNTIL_RESET") return t;
  return null;
}

/** GET: `?role=monitor` + device header → queued commands for the monitoring handset. `?id=` → single command (owner). */
export async function GET(req: Request): Promise<Response> {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id?.trim()) {
    const row = await getAnchorSessionCommand(u.uid, id.trim());
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ command: row }, { headers: { "Cache-Control": "no-store" } });
  }

  if (url.searchParams.get("role") === "monitor") {
    const headerDevice = req.headers.get(DEVICE_HEADER)?.trim() || "";
    const effective = await getEffectiveMonitorDeviceIdForUid(u.uid);
    const geoForLog = await getAnchorGeofenceConfig(u.uid);
    const activeSessionFingerprint = `${u.uid}|armed=${geoForLog.armed}|r=${geoForLog.radiusM}|mon_geo=${geoForLog.monitorDeviceId}|la=${geoForLog.lastAlertAt ?? "null"}`;
    const pollAccepted = Boolean(effective && headerDevice && headerDevice === effective);
    const match = effective && headerDevice ? headerDevice === effective : false;

    console.warn(
      "[ANCHOR_MONITOR_POLL_SRV]",
      JSON.stringify({
        uid: u.uid,
        headerDeviceId: headerDevice || null,
        effectiveMonitorDeviceId: effective ?? null,
        match,
        activeSessionFingerprint,
        pollAccepted,
      }),
    );

    if (!pollAccepted) {
      const mon = await getAnchorMonitorConfig(u.uid);
      anchorCommandServerLog("monitor_poll_denied", {
        uid: u.uid,
        headerDevice: headerDevice ? `${headerDevice.slice(0, 8)}…` : "",
        effective: effective ?? null,
        serverMonitor: mon.monitorDeviceId,
        geofenceMonitor: geoForLog.monitorDeviceId,
      });
      console.warn(
        "[ANCHOR_MONITOR_POLL_SRV]",
        JSON.stringify({
          phase: "denied",
          uid: u.uid,
          commandsQueuedFound: 0,
          commandsReturned: 0,
          serverEffectiveMonitorDeviceId: effective ?? null,
        }),
      );
      return NextResponse.json(
        {
          commands: [],
          pollAccepted: false as const,
          serverEffectiveMonitorDeviceId: effective ?? null,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const commands = await listQueuedAnchorSessionCommands(u.uid);
    anchorCommandServerLog("monitor_poll_ok", { uid: u.uid, count: commands.length, ids: commands.map((c) => c.id) });
    console.warn(
      "[ANCHOR_MONITOR_POLL_SRV]",
      JSON.stringify({
        phase: "ok",
        uid: u.uid,
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
        commands,
        pollAccepted: true as const,
        serverEffectiveMonitorDeviceId: effective ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (url.searchParams.get("role") === "diagnostics") {
    const effective = await getEffectiveMonitorDeviceIdForUid(u.uid);
    const [mon, geo, pending] = await Promise.all([
      getAnchorMonitorConfig(u.uid),
      getAnchorGeofenceConfig(u.uid),
      listPendingAnchorSessionCommandsForUid(u.uid),
    ]);
    anchorCommandServerLog("diagnostics_snapshot", { uid: u.uid, pending: pending.length });
    return NextResponse.json(
      {
        effectiveMonitorDeviceId: effective,
        serverMonitorDeviceId: mon.monitorDeviceId,
        geofenceMonitorDeviceId: geo.monitorDeviceId,
        geofenceArmed: geo.armed,
        pendingCommands: pending,
        transport: "http_poll" as const,
        note:
          "Commands use HTTP polling on the boat (no Supabase Realtime channel). Background browser tabs may throttle timers; use visibility + shorter intervals while armed.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { error: "Use ?role=monitor, ?role=diagnostics, or ?id=" },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
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
      : req.headers.get(DEVICE_HEADER)?.trim() || "";
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
