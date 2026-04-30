import { NextResponse } from "next/server";
import { requireGearUser } from "@/lib/gear-api-helpers";

export const runtime = "nodejs";

/** Ensures you are signed in (required for classifieds actions). */
export async function GET() {
  try {
    const u = await requireGearUser();
    return NextResponse.json({ ok: true as const, uid: u.uid, email: u.email, isAdmin: u.isAdmin });
  } catch {
    return NextResponse.json({ ok: false as const, error: "Sign-in required" }, { status: 401 });
  }
}
