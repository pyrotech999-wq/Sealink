import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";
import { AUTH_EMAIL_COOKIE, normaliseEmail, uidFromEmail } from "@/lib/auth";
import { deactivateAccountDevice, registerAccountDevice } from "@/lib/account-devices-store";

export async function POST(req: Request) {
  let email = "";
  let deviceId = "";
  let deviceName = "";
  let deactivateDeviceId = "";
  try {
    const body = (await req.json()) as {
      email?: unknown;
      deviceId?: unknown;
      deviceName?: unknown;
      deactivateDeviceId?: unknown;
    };
    email = typeof body.email === "string" ? normaliseEmail(body.email) : "";
    deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
    deviceName = typeof body.deviceName === "string" ? body.deviceName : "";
    deactivateDeviceId = typeof body.deactivateDeviceId === "string" ? body.deactivateDeviceId : "";
  } catch {
    /* */
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  const uid = uidFromEmail(email);
  if (deactivateDeviceId) {
    const active = await deactivateAccountDevice(uid, deactivateDeviceId);
    return NextResponse.json({ ok: true, devices: active });
  }

  if (deviceId) {
    const reg = await registerAccountDevice(uid, deviceId, deviceName, 2);
    if (!reg.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "You can only use SeaLink on 2 devices at once. Deactivate one to continue.",
          devices: reg.devices,
        },
        { status: 409 },
      );
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  res.cookies.set(AUTH_EMAIL_COOKIE, email, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
