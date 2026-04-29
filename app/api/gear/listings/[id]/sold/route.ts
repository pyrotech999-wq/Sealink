import { NextResponse } from "next/server";
import { applySellerCookie, resolveSellerUid } from "@/lib/gear-api-helpers";
import { loadGearListings, updateListing } from "@/lib/gear-store";
import { toPublicListing } from "@/lib/gear-public";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { uid, cookieFresh } = await resolveSellerUid();

  const out = await updateListing(id, uid, (l) => {
    if (l.soldAt) return null;
    return { ...l, soldAt: new Date().toISOString() };
  });

  if (!out.ok) {
    return NextResponse.json({ error: out.error ?? "Could not update" }, { status: out.error === "Not allowed" ? 403 : 404 });
  }

  const all = await loadGearListings();
  const row = all.find((l) => l.id === id);
  const res = NextResponse.json({
    listing: row ? toPublicListing(row, uid) : { id, soldAt: new Date().toISOString(), isOwner: true },
  });
  if (cookieFresh) applySellerCookie(res, uid);
  return res;
}
