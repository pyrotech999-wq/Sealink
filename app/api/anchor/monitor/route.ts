import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { getAnchorMonitorConfig, setAnchorMonitorConfig } from "@/lib/anchor-monitor-store";
import { createAnchorAlert } from "@/lib/anchor-alerts-store";

export const runtime = "nodejs";

type Body = {
  monitorDeviceId?: unknown;
  alertDeviceIds?: unknown;
};

export async function GET(): Promise<Response> {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const cfg = await getAnchorMonitorConfig(u.uid);
  return NextResponse.json({ ok: true as const, config: cfg });
}

export async function POST(req: Request): Promise<Response> {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cur = await getAnchorMonitorConfig(u.uid);

  const monitorDeviceId =
    body.monitorDeviceId === null
      ? null
      : typeof body.monitorDeviceId === "string"
        ? body.monitorDeviceId.trim() || null
        : undefined;

  const alertDeviceIds =
    Array.isArray(body.alertDeviceIds) ? (body.alertDeviceIds as unknown[]).filter((x) => typeof x === "string") as string[] : undefined;

  let next: Awaited<ReturnType<typeof setAnchorMonitorConfig>>;
  try {
    next = await setAnchorMonitorConfig(u.uid, {
      ...(monitorDeviceId !== undefined ? { monitorDeviceId } : {}),
      ...(alertDeviceIds !== undefined ? { alertDeviceIds } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/anchor/monitor POST] setAnchorMonitorConfig", msg);
    return NextResponse.json(
      { ok: false as const, error: msg },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  // If monitor device changed, create a warning which persists for 48 hours.
  if (monitorDeviceId !== undefined && monitorDeviceId !== cur.monitorDeviceId) {
    const from = cur.monitorDeviceId ? cur.monitorDeviceId.slice(0, 8) : "none";
    const to = monitorDeviceId ? monitorDeviceId.slice(0, 8) : "none";
    const msg = `Anchor monitoring switched from ${from} to ${to}. Monitoring on the previous device will stop.`;
    try {
      await createAnchorAlert(u.uid, msg, { kind: "warning", ttlMs: 48 * 60 * 60 * 1000 });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error("[api/anchor/monitor POST] createAnchorAlert failed (config still saved)", err);
    }
  }

  return NextResponse.json({ ok: true as const, config: next });
}

