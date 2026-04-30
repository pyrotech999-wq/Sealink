import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";
import { AUTH_EMAIL_COOKIE, normaliseEmail, uidFromEmail } from "@/lib/auth";
import { deactivateAccountDevice, registerAccountDevice } from "@/lib/account-devices-store";
import { getUserByEmail } from "@/lib/users-store";
import { verifyPassword } from "@/lib/password-hash";
import { sessionCookieBase } from "@/lib/session-cookies";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let email = "";
  let password = "";
  let deviceId = "";
  let deviceName = "";
  let deactivateDeviceId = "";
  let rememberMe = false;
  try {
    const body = (await req.json()) as {
      email?: unknown;
      password?: unknown;
      deviceId?: unknown;
      deviceName?: unknown;
      deactivateDeviceId?: unknown;
      rememberMe?: unknown;
    };
    email = typeof body.email === "string" ? normaliseEmail(body.email) : "";
    password = typeof body.password === "string" ? body.password : "";
    deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
    deviceName = typeof body.deviceName === "string" ? body.deviceName : "";
    deactivateDeviceId = typeof body.deactivateDeviceId === "string" ? body.deactivateDeviceId : "";
    // Default long session when omitted; only opt out on explicit false (incl. JSON quirks).
    const rawRemember = body.rememberMe;
    rememberMe = !(rawRemember === false || rawRemember === "false" || rawRemember === 0);
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

  const user = await getUserByEmail(email);
  if (!user) {
    // Avoid account enumeration.
    return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
  }
  if (!password || !verifyPassword(password, user.password)) {
    return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
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
  const base = sessionCookieBase();
  const sessionMaxAge = rememberMe ? 60 * 60 * 24 * 180 : 60 * 60 * 24 * 14;
  const emailMaxAge = rememberMe ? 60 * 60 * 24 * 365 : 60 * 60 * 24 * 180;
  res.cookies.set(DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE, {
    ...base,
    maxAge: sessionMaxAge,
  });
  res.cookies.set(AUTH_EMAIL_COOKIE, email, {
    ...base,
    maxAge: emailMaxAge,
  });
  return res;
}

