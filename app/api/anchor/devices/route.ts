import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { listAccountDevices } from "@/lib/account-devices-store";
import { listAnchorDevices, upsertAnchorDevice, type AnchorDeviceRow } from "@/lib/anchor-devices-store";

export const runtime = "nodejs";

/** Anchor GPS registry plus any active signed-in devices (so a second phone appears before its first location POST). */
async function listAnchorDevicesForUi(uid: string): Promise<AnchorDeviceRow[]> {
  const [fromAnchor, accountDevs] = await Promise.all([listAnchorDevices(uid), listAccountDevices(uid)]);
  const map = new Map<string, AnchorDeviceRow>();
  for (const r of fromAnchor) {
    map.set(r.deviceId, r);
  }
  for (const a of accountDevs) {
    if (!a.active) continue;
    if (map.has(a.deviceId)) continue;
    map.set(a.deviceId, {
      uid,
      deviceId: a.deviceId,
      name: a.name?.trim() ? a.name.trim() : "This device",
      updatedAt: a.lastSeenAt,
      lastLat: null,
      lastLng: null,
      lastFixAt: null,
    });
  }
  return [...map.values()].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function GET() {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const devices = await listAnchorDevicesForUi(u.uid);
  return NextResponse.json({ devices });
}

type Body = { deviceId?: unknown; name?: unknown; lat?: unknown; lng?: unknown };

export async function POST(req: Request) {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "This device";

  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  const hasFix = Number.isFinite(lat) && Number.isFinite(lng);

  await upsertAnchorDevice(u.uid, deviceId, {
    name,
    ...(hasFix ? { lastLat: lat, lastLng: lng, lastFixAt: new Date().toISOString() } : {}),
  });

  return NextResponse.json({ ok: true as const });
}

