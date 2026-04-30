import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE } from "@/lib/demo-session";
import { AUTH_EMAIL_COOKIE } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(AUTH_EMAIL_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
