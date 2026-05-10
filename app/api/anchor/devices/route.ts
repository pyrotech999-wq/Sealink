import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { listAnchorDevicesForUi } from "@/lib/anchor-devices-for-ui";
import { upsertAnchorDevice } from "@/lib/anchor-devices-store";

export const runtime = "nodejs";

export async function GET() {
  const u = await requireAuthUser().catch(() => null);
  if (!u) {
    return NextResponse.json(
      { error: "Sign-in required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const devices = await listAnchorDevicesForUi(u.uid);
  return NextResponse.json(
    { devices },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
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
  const rawName = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
  if (!rawName) {
    return NextResponse.json(
      { error: "name required — set a short label for this device (e.g. Helm phone)." },
      { status: 400 },
    );
  }
  const name = rawName;

  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  const hasFix = Number.isFinite(lat) && Number.isFinite(lng);

  await upsertAnchorDevice(u.uid, deviceId, {
    name,
    ...(hasFix ? { lastLat: lat, lastLng: lng, lastFixAt: new Date().toISOString() } : {}),
  });

  return NextResponse.json({ ok: true as const });
}

