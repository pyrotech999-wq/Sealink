import { NextResponse } from "next/server";
import { requireGearUser } from "@/lib/gear-api-helpers";
import { extendExpiresFromCurrent, loadGearListings, updateListing } from "@/lib/gear-store";
import { toPublicListing } from "@/lib/gear-public";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let uid: string;
  let isAdmin = false;
  try {
    const u = await requireGearUser();
    uid = u.uid;
    isAdmin = u.isAdmin;
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  const allBefore = await loadGearListings();
  const rowBefore = allBefore.find((l) => l.id === id);
  if (!rowBefore) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  if (!isAdmin && rowBefore.sellerUid !== uid) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const out = await updateListing(id, rowBefore.sellerUid, (l) => {
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

  return NextResponse.json({ listing: toPublicListing(row, uid) });
}
