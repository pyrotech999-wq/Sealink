import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const u = await getAuthUser();
  if (!u) return NextResponse.json({ signedIn: false as const });
  return NextResponse.json({
    signedIn: true as const,
    email: u.email,
    uid: u.uid,
    isAdmin: u.isAdmin,
  });
}

