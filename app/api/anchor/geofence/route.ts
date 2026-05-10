import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { getAnchorGeofenceConfig, setAnchorGeofenceConfig } from "@/lib/anchor-geofence-store";
import { ANCHOR_RADIUS_ADMIN_TEST_M, parseAnchorRadiusM } from "@/lib/anchor-alert-storage";
import { resolveThisMonitorDeviceIdForServerPersist } from "@/lib/anchor-monitor-device-resolve";
import { anchorCommandServerLog } from "@/lib/anchor-command-server-log";

export const runtime = "nodejs";

const DEVICE_HEADER = "x-sealink-device-id";

type Body = {
  armed?: unknown;
  lat?: unknown;
  lng?: unknown;
  radiusM?: unknown;
  angleDeg?: unknown;
  monitorDeviceId?: unknown;
  lastBearingDeg?: unknown;
  lastAlertAt?: unknown;
  remoteAlarmSilencedUntilReset?: unknown;
};

export async function GET(): Promise<Response> {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const row = await getAnchorGeofenceConfig(u.uid);
  const cfg =
    !u.isAdmin && row.radiusM === ANCHOR_RADIUS_ADMIN_TEST_M ? { ...row, radiusM: 20 } : row;
  return NextResponse.json({ ok: true as const, config: cfg }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  const headerDevice = req.headers.get(DEVICE_HEADER)?.trim() || "";

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let resolvedMonitor: string | undefined;
  if (typeof body.monitorDeviceId === "string") {
    const raw = body.monitorDeviceId.trim() || "this";
    resolvedMonitor = resolveThisMonitorDeviceIdForServerPersist(raw, headerDevice);
    if (raw === "this" && resolvedMonitor && resolvedMonitor !== "this" && resolvedMonitor !== raw) {
      anchorCommandServerLog("geofence_monitor_this_resolved", {
        uid: u.uid,
        resolvedTo: resolvedMonitor.slice(0, 12),
      });
    }
  }

  const patch = {
    ...(typeof body.armed === "boolean" ? { armed: body.armed } : {}),
    ...(typeof body.lat === "number" && Number.isFinite(body.lat) ? { lat: body.lat } : body.lat === null ? { lat: null } : {}),
    ...(typeof body.lng === "number" && Number.isFinite(body.lng) ? { lng: body.lng } : body.lng === null ? { lng: null } : {}),
    ...(typeof body.radiusM === "number" && Number.isFinite(body.radiusM)
      ? { radiusM: parseAnchorRadiusM(body.radiusM, { isAdmin: u.isAdmin }) }
      : {}),
    ...(typeof body.angleDeg === "number" && Number.isFinite(body.angleDeg) ? { angleDeg: body.angleDeg } : {}),
    ...(resolvedMonitor !== undefined ? { monitorDeviceId: resolvedMonitor } : {}),
    ...(typeof body.lastBearingDeg === "number" && Number.isFinite(body.lastBearingDeg) ? { lastBearingDeg: body.lastBearingDeg } : body.lastBearingDeg === null ? { lastBearingDeg: null } : {}),
    ...(typeof body.lastAlertAt === "string" ? { lastAlertAt: body.lastAlertAt } : body.lastAlertAt === null ? { lastAlertAt: null } : {}),
    ...(typeof body.remoteAlarmSilencedUntilReset === "boolean"
      ? { remoteAlarmSilencedUntilReset: body.remoteAlarmSilencedUntilReset }
      : {}),
  };

  const next = await setAnchorGeofenceConfig(u.uid, patch, { isAdmin: u.isAdmin });
  return NextResponse.json({ ok: true as const, config: next }, { headers: { "Cache-Control": "no-store" } });
}

