import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
