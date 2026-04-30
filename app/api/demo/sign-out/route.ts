import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE } from "@/lib/demo-session";
import { AUTH_EMAIL_COOKIE } from "@/lib/auth";
import { sessionCookieBase } from "@/lib/session-cookies";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const base = sessionCookieBase();
  res.cookies.set(DEMO_SESSION_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(AUTH_EMAIL_COOKIE, "", { ...base, maxAge: 0 });
  return res;
}
