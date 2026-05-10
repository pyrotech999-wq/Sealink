import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { anchorCommandsExposeServerErrors } from "@/lib/anchor-api-debug-server";
import { anchorCommandServerLog } from "@/lib/anchor-command-server-log";
import { ANCHOR_DEVICE_ID_HEADER } from "@/lib/anchor-device-id-header";
import { getEffectiveMonitorDeviceIdForUid } from "@/lib/anchor-effective-monitor-server";
import {
  getAnchorSessionCommand,
  updateAnchorSessionCommandStatus,
  type AnchorSessionCommandStatus,
} from "@/lib/anchor-session-commands-store";

export const runtime = "nodejs";

function parseStatus(s: unknown): AnchorSessionCommandStatus | null {
  if (s === "queued" || s === "received" || s === "applied" || s === "failed") return s;
  return null;
}

function devErrorPayload(error: unknown, code: string): Record<string, unknown> {
  const base: Record<string, unknown> = { ok: false as const, error: code };
  if (!anchorCommandsExposeServerErrors()) return base;
  const e = error instanceof Error ? error : new Error(String(error));
  return { ...base, message: e.message, stack: e.stack };
}

function logPatchError(args: {
  req: Request;
  uid: string | null;
  id: string;
  role: string;
  effective: string | null;
  error: unknown;
}): void {
  let q = "";
  try {
    q = new URL(args.req.url).search;
  } catch {
    q = "(bad_url)";
  }
  console.error("[ANCHOR COMMANDS PATCH ERROR]", {
    role: args.role,
    uid: args.uid,
    id: args.id,
    deviceId: args.req.headers.get(ANCHOR_DEVICE_ID_HEADER),
    effectiveMonitorDeviceId: args.effective,
    commandQueryParams: q,
    error: args.error,
    stack: args.error instanceof Error ? args.error.stack : undefined,
  });
}

/** Monitoring handset updates command status after applying (or failing) locally. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const noStore = { "Cache-Control": "no-store" as const };
  let uid: string | null = null;
  const role = "patch_status";
  let id = "";
  let effective: string | null = null;

  try {
    const u = await requireAuthUser().catch(() => null);
    if (!u?.uid) {
      return NextResponse.json({ ok: false, error: "Sign-in required", code: "AUTH_REQUIRED" }, { status: 401, headers: noStore });
    }
    uid = u.uid;

    const params = await ctx.params;
    id = params.id?.trim() ?? "";
    if (!id) {
      return NextResponse.json({ ok: false, error: "id required", code: "BAD_ID" }, { status: 400, headers: noStore });
    }

    const headerDevice = (req.headers.get(ANCHOR_DEVICE_ID_HEADER) ?? "").trim();
    effective = await getEffectiveMonitorDeviceIdForUid(u.uid);
    if (!effective || headerDevice !== effective) {
      anchorCommandServerLog("command_patch_denied", { uid: u.uid, id, headerDevice, effective });
      return NextResponse.json(
        { ok: false, error: "Only the monitoring handset can update command status", code: "PATCH_DENIED" },
        { status: 403, headers: noStore },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON", code: "BAD_JSON" }, { status: 400, headers: noStore });
    }

    const status = parseStatus(body.status);
    if (!status) {
      return NextResponse.json({ ok: false, error: "Invalid status", code: "BAD_STATUS" }, { status: 400, headers: noStore });
    }

    const existing = await getAnchorSessionCommand(u.uid, id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found", code: "NOT_FOUND" }, { status: 404, headers: noStore });
    }

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
        return NextResponse.json({ ok: true, command: existing }, { headers: noStore });
      }
      if (existing.status !== "queued") {
        anchorCommandServerLog("command_patch_reject_received", { uid: u.uid, id, currentStatus: existing.status });
        return NextResponse.json({ ok: false, error: "Command is not queued", code: "CONFLICT" }, { status: 409, headers: noStore });
      }
    }

    if (status === "applied") {
      if (existing.status === "applied") {
        return NextResponse.json({ ok: true, command: existing }, { headers: noStore });
      }
      if (existing.status !== "received") {
        anchorCommandServerLog("command_patch_reject_applied", { uid: u.uid, id, currentStatus: existing.status });
        return NextResponse.json(
          { ok: false, error: "Command must be in received state before applied", code: "CONFLICT" },
          { status: 409, headers: noStore },
        );
      }
    }

    if (status === "failed") {
      if (existing.status === "applied" || existing.status === "failed") {
        return NextResponse.json({ ok: true, command: existing }, { headers: noStore });
      }
    }

    if (status === "queued") {
      anchorCommandServerLog("command_patch_reject_queued", { uid: u.uid, id });
      return NextResponse.json({ ok: false, error: "Cannot revert to queued", code: "BAD_TRANSITION" }, { status: 400, headers: noStore });
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

    return NextResponse.json({ ok: true, command: next }, { headers: noStore });
  } catch (error) {
    logPatchError({ req, uid, id, role, effective, error });
    return NextResponse.json(devErrorPayload(error, "anchor_commands_patch_failed"), { status: 500, headers: noStore });
  }
}
