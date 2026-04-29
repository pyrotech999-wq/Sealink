import { NextResponse } from "next/server";
import { applySellerCookie, resolveSellerUid } from "@/lib/gear-api-helpers";
import { extendExpiresFromCurrent, loadGearListings, updateListing } from "@/lib/gear-store";
import { toPublicListing } from "@/lib/gear-public";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { uid, cookieFresh } = await resolveSellerUid();

  const out = await updateListing(id, uid, (l) => {
    if (l.soldAt) return null;
    if (new Date(l.expiresAt).getTime() <= Date.now()) return null;
    return {
      ...l,
      expiresAt: extendExpiresFromCurrent(l.expiresAt),
      reminderSentAt: null,
    };
  });

  if (!out.ok) {
    return NextResponse.json({ error: out.error ?? "Could not extend" }, { status: out.error === "Not allowed" ? 403 : 404 });
  }

  const all = await loadGearListings();
  const row = all.find((l) => l.id === id);
  if (!row) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const res = NextResponse.json({ listing: toPublicListing(row, uid) });
  if (cookieFresh) applySellerCookie(res, uid);
  return res;
}
