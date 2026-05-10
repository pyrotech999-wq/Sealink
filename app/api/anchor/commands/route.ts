import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { anchorCommandServerLog } from "@/lib/anchor-command-server-log";
import { getEffectiveMonitorDeviceIdForUid } from "@/lib/anchor-effective-monitor-server";
import {
  createAnchorSessionCommand,
  getAnchorSessionCommand,
  listQueuedAnchorSessionCommands,
  type AnchorSessionCommandType,
} from "@/lib/anchor-session-commands-store";

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
    if (!effective || headerDevice !== effective) {
      anchorCommandServerLog("monitor_poll_denied", { uid: u.uid, headerDevice, effective });
      return NextResponse.json({ commands: [] }, { headers: { "Cache-Control": "no-store" } });
    }
    const commands = await listQueuedAnchorSessionCommands(u.uid);
    anchorCommandServerLog("monitor_poll", { uid: u.uid, count: commands.length });
    return NextResponse.json({ commands }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ error: "Use ?role=monitor or ?id=" }, { status: 400, headers: { "Cache-Control": "no-store" } });
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

  return NextResponse.json({ command: row }, { headers: { "Cache-Control": "no-store" } });
}
