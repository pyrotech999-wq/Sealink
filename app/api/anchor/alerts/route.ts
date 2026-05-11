import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { sendAnchorGeofenceAlertEmail } from "@/lib/anchor-alert-email";
import { sendAnchorGeofenceAlertTelegram } from "@/lib/anchor-alert-telegram";
import {
  createAnchorAlert,
  listUnseenAnchorAlerts,
  markAllUnseenAnchorAlertsForUser,
  markAnchorAlertSeen,
} from "@/lib/anchor-alerts-store";
import { purgeAllAnchorSessionCommands } from "@/lib/anchor-session-commands-store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  const user = await requireAuthUser();
  const alerts = await listUnseenAnchorAlerts(user.uid);
  return NextResponse.json({ alerts });
}

export async function POST(req: Request): Promise<Response> {
  const user = await requireAuthUser();
  let body: unknown = null;
  try {
    body = (await req.json()) as unknown;
  } catch {
    body = null;
  }

  if (body && typeof body === "object" && "purgeAll" in body && (body as { purgeAll?: unknown }).purgeAll === true) {
    const [alertsMarked, cmdsPurged] = await Promise.all([
      markAllUnseenAnchorAlertsForUser(user.uid),
      purgeAllAnchorSessionCommands(user.uid),
    ]);
    return NextResponse.json({ ok: true as const, alertsMarked, commandsPurged: cmdsPurged });
  }

  if (body && typeof body === "object" && "markAllSeen" in body && (body as { markAllSeen?: unknown }).markAllSeen === true) {
    const n = await markAllUnseenAnchorAlertsForUser(user.uid);
    return NextResponse.json({ ok: true as const, marked: n });
  }

  if (body && typeof body === "object" && "seenId" in body) {
    const seenId = (body as { seenId?: unknown }).seenId;
    if (typeof seenId !== "string" || !seenId) return NextResponse.json({ ok: false }, { status: 400 });
    const ok = await markAnchorAlertSeen(user.uid, seenId);
    return NextResponse.json({ ok });
  }

  const msg = body && typeof body === "object" && "message" in body ? (body as { message?: unknown }).message : null;
  if (typeof msg !== "string" || !msg.trim()) return NextResponse.json({ ok: false }, { status: 400 });

  const kindRaw = body && typeof body === "object" && "kind" in body ? (body as { kind?: unknown }).kind : null;
  const kind = kindRaw === "warning" ? "warning" : "alert";
  const row = await createAnchorAlert(user.uid, msg, { kind });
  if (kind === "alert") {
    sendAnchorGeofenceAlertEmail(user.email, msg);
    sendAnchorGeofenceAlertTelegram(msg);
  }
  return NextResponse.json({ ok: true, alert: row });
}

