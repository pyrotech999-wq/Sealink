import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { getSlotBalance } from "@/lib/vessel-freelisting-store";

export const runtime = "nodejs";

export async function GET() {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const balance = await getSlotBalance(u.uid);
  return NextResponse.json({ balance });
}
