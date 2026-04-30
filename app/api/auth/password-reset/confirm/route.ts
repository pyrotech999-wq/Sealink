import { NextResponse } from "next/server";
import { normaliseEmail } from "@/lib/auth";
import { consumeResetToken } from "@/lib/password-reset-store";
import { hashPassword } from "@/lib/password-hash";
import { getUserByEmail, upsertUser } from "@/lib/users-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let token = "";
  let password = "";
  try {
    const body = (await req.json()) as { token?: unknown; password?: unknown };
    token = typeof body.token === "string" ? body.token.trim() : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    /* */
  }

  if (!token) return NextResponse.json({ ok: false, error: "Reset token missing." }, { status: 400 });
  if (!password || password.length < 10) {
    return NextResponse.json({ ok: false, error: "Use at least 10 characters for your password." }, { status: 400 });
  }

  const consumed = await consumeResetToken(token);
  if (!consumed.ok) {
    return NextResponse.json({ ok: false, error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const email = normaliseEmail(consumed.email);
  const user = await getUserByEmail(email);
  if (!user) {
    // If account was deleted, treat as expired.
    return NextResponse.json({ ok: false, error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  await upsertUser(email, hashPassword(password));
  return NextResponse.json({ ok: true });
}

