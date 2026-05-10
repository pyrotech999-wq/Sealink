import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { anchorCommandServerLog } from "@/lib/anchor-command-server-log";
import { getEffectiveMonitorDeviceIdForUid } from "@/lib/anchor-effective-monitor-server";
import {
  getAnchorSessionCommand,
  updateAnchorSessionCommandStatus,
  type AnchorSessionCommandStatus,
} from "@/lib/anchor-session-commands-store";

export const runtime = "nodejs";

const DEVICE_HEADER = "x-sealink-device-id";

function parseStatus(s: unknown): AnchorSessionCommandStatus | null {
  if (s === "queued" || s === "received" || s === "applied" || s === "failed") return s;
  return null;
}

/** Monitoring handset updates command status after applying (or failing) locally. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "id required" }, { status: 400 });

  const headerDevice = req.headers.get(DEVICE_HEADER)?.trim() || "";
  const effective = await getEffectiveMonitorDeviceIdForUid(u.uid);
  if (!effective || headerDevice !== effective) {
    anchorCommandServerLog("command_patch_denied", { uid: u.uid, id, headerDevice, effective });
    return NextResponse.json({ error: "Only the monitoring handset can update command status" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = parseStatus(body.status);
  if (!status) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const existing = await getAnchorSessionCommand(u.uid, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  anchorCommandServerLog("command_patch_request", {
    uid: u.uid,
    id,
    requestedStatus: status,
    currentStatus: existing.status,
    headerDevice,
    effective,
  });

  if (status === "received") {
    if (existing.status === "received") {
      return NextResponse.json({ command: existing }, { headers: { "Cache-Control": "no-store" } });
    }
    if (existing.status !== "queued") {
      anchorCommandServerLog("command_patch_reject_received", { uid: u.uid, id, currentStatus: existing.status });
      return NextResponse.json({ error: "Command is not queued" }, { status: 409 });
    }
  }

  if (status === "applied") {
    if (existing.status === "applied") {
      return NextResponse.json({ command: existing }, { headers: { "Cache-Control": "no-store" } });
    }
    if (existing.status !== "received") {
      anchorCommandServerLog("command_patch_reject_applied", { uid: u.uid, id, currentStatus: existing.status });
      return NextResponse.json({ error: "Command must be in received state before applied" }, { status: 409 });
    }
  }

  if (status === "failed") {
    if (existing.status === "applied" || existing.status === "failed") {
      return NextResponse.json({ command: existing }, { headers: { "Cache-Control": "no-store" } });
    }
  }

  if (status === "queued") {
    anchorCommandServerLog("command_patch_reject_queued", { uid: u.uid, id });
    return NextResponse.json({ error: "Cannot revert to queued" }, { status: 400 });
  }

  const err =
    typeof body.errorMessage === "string" && body.errorMessage.trim() ? body.errorMessage.trim().slice(0, 500) : null;

  const next = await updateAnchorSessionCommandStatus({
    uid: u.uid,
    id,
    status,
    errorMessage: err,
  });

  anchorCommandServerLog("command_patched", { uid: u.uid, id, status, error: err });

  return NextResponse.json({ command: next }, { headers: { "Cache-Control": "no-store" } });
}
