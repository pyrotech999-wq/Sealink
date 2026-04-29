import { NextResponse } from "next/server";
import { applySellerCookie, resolveSellerUid } from "@/lib/gear-api-helpers";
import { GEAR_LISTING_TTL_DAYS, GEAR_REMINDER_DAYS_BEFORE } from "@/lib/gear-constants";
import { toPublicListing } from "@/lib/gear-public";
import type { GearCategoryId, GearListing } from "@/lib/gear-types";
import { isGearCategoryId } from "@/lib/gear-types";
import { appendListing, defaultExpiresAt, loadGearListings, newListingId } from "@/lib/gear-store";
import { validateGearText } from "@/lib/gear-validate";

export const runtime = "nodejs";

type CreateBody = {
  title?: unknown;
  description?: unknown;
  categoryId?: unknown;
  priceLabel?: unknown;
  confirmNotVessel?: unknown;
};

export async function GET(req: Request) {
  const { uid, cookieFresh } = await resolveSellerUid();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const cat = url.searchParams.get("category") ?? "";
  const scope = url.searchParams.get("scope") ?? "";

  let rows = await loadGearListings();
  rows = rows.filter((l) => !l.soldAt);

  if (scope === "mine") {
    rows = rows.filter((l) => l.sellerUid === uid);
  }

  if (cat && isGearCategoryId(cat)) {
    rows = rows.filter((l) => l.categoryId === cat);
  }

  if (q) {
    rows = rows.filter(
      (l) => l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q),
    );
  }

  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const listings = rows.map((l) => toPublicListing(l, uid));

  const res = NextResponse.json({
    listings,
    policy: {
      listingTtlDays: GEAR_LISTING_TTL_DAYS,
      reminderDaysBefore: GEAR_REMINDER_DAYS_BEFORE,
      note: "Equipment and gear only — not boats or hulls. Listings expire automatically unless extended.",
    },
  });
  if (cookieFresh) applySellerCookie(res, uid);
  return res;
}

export async function POST(req: Request) {
  const { uid, cookieFresh } = await resolveSellerUid();

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.confirmNotVessel !== true) {
    return NextResponse.json(
      { error: "You must confirm this listing is boat equipment or gear, not a boat or hull." },
      { status: 400 },
    );
  }

  const title = typeof body.title === "string" ? body.title : "";
  const description = typeof body.description === "string" ? body.description : "";
  const categoryId = typeof body.categoryId === "string" ? body.categoryId : "";
  const priceRaw = typeof body.priceLabel === "string" ? body.priceLabel.trim() : "";

  if (!isGearCategoryId(categoryId)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const textErr = validateGearText(title, description);
  if (textErr) {
    return NextResponse.json({ error: textErr }, { status: 400 });
  }

  const priceLabel = priceRaw ? priceRaw.slice(0, 80) : null;

  const now = new Date();
  const row: GearListing = {
    id: newListingId(),
    sellerUid: uid,
    title: title.trim(),
    description: description.trim(),
    categoryId: categoryId as GearCategoryId,
    priceLabel,
    createdAt: now.toISOString(),
    expiresAt: defaultExpiresAt(now),
    soldAt: null,
    reminderSentAt: null,
  };

  await appendListing(row);

  const res = NextResponse.json({ listing: toPublicListing(row, uid) });
  if (cookieFresh) applySellerCookie(res, uid);
  return res;
}
