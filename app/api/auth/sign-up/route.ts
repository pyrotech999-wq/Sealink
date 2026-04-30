import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";
import { AUTH_EMAIL_COOKIE, normaliseEmail, uidFromEmail } from "@/lib/auth";
import { registerAccountDevice } from "@/lib/account-devices-store";
import { hashPassword } from "@/lib/password-hash";
import { getUserByEmail, upsertUser } from "@/lib/users-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let email = "";
  let password = "";
  let deviceId = "";
  let deviceName = "";
  try {
    const body = (await req.json()) as { email?: unknown; password?: unknown; deviceId?: unknown; deviceName?: unknown };
    email = typeof body.email === "string" ? normaliseEmail(body.email) : "";
    password = typeof body.password === "string" ? body.password : "";
    deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
    deviceName = typeof body.deviceName === "string" ? body.deviceName : "";
  } catch {
    /* */
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (!password || password.length < 10) {
    return NextResponse.json({ ok: false, error: "Use at least 10 characters for your password." }, { status: 400 });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json({ ok: false, error: "An account already exists for that email. Try signing in." }, { status: 409 });
  }

  const uid = uidFromEmail(email);
  await upsertUser(email, hashPassword(password));

  if (deviceId) {
    const reg = await registerAccountDevice(uid, deviceId, deviceName, 2);
    if (!reg.ok) {
      return NextResponse.json(
        { ok: false, error: "You can only use SeaLink on 2 devices at once. Deactivate one to continue.", devices: reg.devices },
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

