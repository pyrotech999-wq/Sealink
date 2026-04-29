import { NextResponse } from "next/server";
import { applySellerCookie, resolveSellerUid } from "@/lib/gear-api-helpers";

export const runtime = "nodejs";

/** Ensures the anonymous member cookie exists (used by the gear marketplace). */
export async function GET() {
  const { uid, cookieFresh } = await resolveSellerUid();
  const res = NextResponse.json({ ok: true as const });
  if (cookieFresh) applySellerCookie(res, uid);
  return res;
}
