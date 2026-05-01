import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { registerAccountDevice } from "@/lib/account-devices-store";

export const runtime = "nodejs";

/** Ensures this browser is in account_devices (sign-in registration can fail silently on DB errors). */
export async function POST(req: Request) {
  const u = await getAuthUser();
  if (!u) return NextResponse.json({ ok: false, error: "Sign-in required" }, { status: 401 });

  let body: { deviceId?: unknown; deviceName?: unknown };
  try {
    body = (await req.json()) as { deviceId?: unknown; deviceName?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  if (!deviceId) return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });

  const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim().slice(0, 40) : "";

  try {
    const reg = await registerAccountDevice(u.uid, deviceId, deviceName || "This device", 2);
    if (!reg.ok) {
      return NextResponse.json(
        { ok: false, error: "DEVICE_LIMIT", devices: reg.devices },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true as const, devices: reg.devices });
  } catch (e) {
    console.error("[demo/register-device]", e);
    return NextResponse.json({ ok: false, error: "Could not register device." }, { status: 500 });
  }
}
