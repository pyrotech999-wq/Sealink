import { NextResponse } from "next/server";
import { requireGearUser } from "@/lib/gear-api-helpers";
import { deleteListing, loadGearListings, updateListing } from "@/lib/gear-store";
import { toPublicListing } from "@/lib/gear-public";
import { isGearCategoryId, isGearListingKind, type GearCategoryId, type GearListingKind } from "@/lib/gear-types";
import { validateGearText } from "@/lib/gear-validate";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

type PatchBody = {
  kind?: unknown;
  title?: unknown;
  description?: unknown;
  categoryId?: unknown;
  priceLabel?: unknown;
};

export async function PATCH(req: Request, ctx: Ctx) {
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

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const allBefore = await loadGearListings();
  const rowBefore = allBefore.find((l) => l.id === id);
  if (!rowBefore) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  if (!isAdmin && rowBefore.sellerUid !== uid) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const title = typeof body.title === "string" ? body.title : rowBefore.title;
  const description = typeof body.description === "string" ? body.description : rowBefore.description;
  const categoryId = typeof body.categoryId === "string" ? body.categoryId : rowBefore.categoryId;
  const priceRaw = typeof body.priceLabel === "string" ? body.priceLabel.trim() : rowBefore.priceLabel ?? "";
  const kindRaw = typeof body.kind === "string" ? body.kind : rowBefore.kind;

  if (!isGearCategoryId(categoryId)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  if (!isGearListingKind(kindRaw)) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });

  const textErr = validateGearText(title, description);
  if (textErr) return NextResponse.json({ error: textErr }, { status: 400 });

  const priceLabel = priceRaw ? priceRaw.slice(0, 80) : null;
  const kind = kindRaw as GearListingKind;

  const out = await updateListing(id, rowBefore.sellerUid, (l) => {
    if (l.soldAt) return null;
    return {
      ...l,
      kind,
      title: title.trim(),
      description: description.trim(),
      categoryId: categoryId as GearCategoryId,
      priceLabel,
    };
  });
  if (!out.ok) return NextResponse.json({ error: out.error ?? "Could not update" }, { status: out.error === "Not allowed" ? 403 : 404 });

  const all = await loadGearListings();
  const row = all.find((l) => l.id === id);
  if (!row) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  return NextResponse.json({ listing: toPublicListing(row, uid) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
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

  const out = await deleteListing(id, rowBefore.sellerUid);
  if (!out.ok) return NextResponse.json({ error: out.error ?? "Could not delete" }, { status: out.error === "Not allowed" ? 403 : 404 });
  return NextResponse.json({ ok: true as const });
}

