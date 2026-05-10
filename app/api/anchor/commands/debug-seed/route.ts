import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { getEffectiveMonitorAndGeofence } from "@/lib/anchor-effective-monitor-server";
import { buildAnchorSessionFingerprint } from "@/lib/anchor-session-fingerprint";
import { createAnchorSessionCommand } from "@/lib/anchor-session-commands-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "no-store" as const };

/**
 * Temporary: enqueue one `INCREASE_RADIUS` command for the signed-in user so the monitor poll can verify
 * `cmds: 1` and apply flow. Enable with `ANCHOR_MONITOR_SEED_TEST=1` on the server only; remove route when done.
 */
export async function POST(): Promise<Response> {
  if (process.env.ANCHOR_MONITOR_SEED_TEST !== "1") {
    return NextResponse.json({ ok: false, error: "disabled", code: "SEED_DISABLED" }, { status: 404, headers: noStore });
  }
  try {
    const u = await requireAuthUser();
    const { effective, geo } = await getEffectiveMonitorAndGeofence(u.uid);
    const sessionId = buildAnchorSessionFingerprint(u.uid, geo);
    if (!sessionId || !effective) {
      return NextResponse.json(
        { ok: false, error: "Arm anchor on map first (active session + monitor required).", code: "NO_ACTIVE_SESSION" },
        { status: 400, headers: noStore },
      );
    }
    const row = await createAnchorSessionCommand({
      uid: u.uid,
      type: "INCREASE_RADIUS",
      meters: 10,
      sourceDeviceId: "debug_seed_sender_device",
      sessionId,
      targetDeviceId: effective,
    });
    return NextResponse.json(
      {
        ok: true,
        command: row,
        note: "Monitor handset should poll GET ?role=monitor and see cmds: 1; remove ANCHOR_MONITOR_SEED_TEST and this route after verification.",
      },
      { headers: noStore },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, code: "SEED_FAILED" }, { status: 500, headers: noStore });
  }
}
