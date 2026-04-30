import { NextResponse } from "next/server";
import { getLegacyGearUid, requireGearUser } from "@/lib/gear-api-helpers";
import { loadGearListings, updateListing } from "@/lib/gear-store";
import { toPublicListing } from "@/lib/gear-public";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let uid: string;
  let legacyUid: string | null = null;
  let isAdmin = false;
  try {
    const u = await requireGearUser();
    uid = u.uid;
    isAdmin = u.isAdmin;
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  legacyUid = await getLegacyGearUid();
  const viewerUids = [uid, legacyUid ?? ""].filter(Boolean);

  const allBefore = await loadGearListings();
  const rowBefore = allBefore.find((l) => l.id === id);
  if (!rowBefore) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  if (!isAdmin && !viewerUids.includes(rowBefore.sellerUid)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const out = await updateListing(id, rowBefore.sellerUid, (l) => {
    if (l.soldAt) return null;
    return { ...l, soldAt: new Date().toISOString() };
  });

  if (!out.ok) {
    return NextResponse.json({ error: out.error ?? "Could not update" }, { status: out.error === "Not allowed" ? 403 : 404 });
  }

  const all = await loadGearListings();
  const row = all.find((l) => l.id === id);
  return NextResponse.json({
    listing: row ? toPublicListing(row, viewerUids) : { id, soldAt: new Date().toISOString(), isOwner: true },
  });
}
