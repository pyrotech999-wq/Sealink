import { NextResponse } from "next/server";
import { getLegacyGearUid, requireGearUser } from "@/lib/gear-api-helpers";
import { GEAR_LISTING_TTL_DAYS, GEAR_REMINDER_DAYS_BEFORE } from "@/lib/gear-constants";
import { toPublicListing } from "@/lib/gear-public";
import type { GearCategoryId, GearListing, GearListingKind } from "@/lib/gear-types";
import { isGearCategoryId, isGearListingKind } from "@/lib/gear-types";
import { appendListing, defaultExpiresAt, loadGearListings, newListingId } from "@/lib/gear-store";
import { validateGearText } from "@/lib/gear-validate";
import { persistListingImages } from "@/lib/listing-uploads";

export const runtime = "nodejs";

type CreateBody = {
  kind?: unknown;
  title?: unknown;
  description?: unknown;
  categoryId?: unknown;
  priceLabel?: unknown;
  confirmNotVessel?: unknown;
};

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB each

function extFromContentType(ct: string): string | null {
  const c = ct.toLowerCase();
  if (c === "image/jpeg" || c === "image/jpg") return "jpg";
  if (c === "image/png") return "png";
  if (c === "image/webp") return "webp";
  return null;
}

function isTruthyFlag(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "on" || s === "yes";
}

export async function GET(req: Request) {
  let uid = "";
  let legacyUid: string | null = null;
  try {
    uid = (await requireGearUser()).uid;
  } catch {
    uid = "";
  }
  legacyUid = await getLegacyGearUid();
  const viewerUids = [uid, legacyUid ?? ""].filter(Boolean);
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const cat = url.searchParams.get("category") ?? "";
  const scope = url.searchParams.get("scope") ?? "";
  const kind = url.searchParams.get("kind") ?? "";

  let rows = await loadGearListings();
  rows = rows.filter((l) => !l.soldAt);

  if (scope === "mine") {
    rows = rows.filter((l) => viewerUids.includes(l.sellerUid));
  }

  if (kind && isGearListingKind(kind)) {
    rows = rows.filter((l) => l.kind === kind);
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

  const listings = rows.map((l) => toPublicListing(l, viewerUids));

  const res = NextResponse.json({
    listings,
    policy: {
      listingTtlDays: GEAR_LISTING_TTL_DAYS,
      reminderDaysBefore: GEAR_REMINDER_DAYS_BEFORE,
      note: "Equipment and gear only — not boats or hulls. Listings expire automatically unless extended.",
    },
  });
  return res;
}

export async function POST(req: Request) {
  let uid: string;
  try {
    uid = (await requireGearUser()).uid;
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  const ct = req.headers.get("content-type") ?? "";
  let body: CreateBody = {};
  let imageFiles: File[] = [];
  try {
    if (ct.toLowerCase().includes("multipart/form-data")) {
      const fd = await req.formData();
      body = {
        kind: fd.get("kind"),
        title: fd.get("title"),
        description: fd.get("description"),
        categoryId: fd.get("categoryId"),
        priceLabel: fd.get("priceLabel"),
        confirmNotVessel: fd.get("confirmNotVessel"),
      };
      imageFiles = fd
        .getAll("images")
        .filter((v): v is File => typeof v === "object" && v != null && "arrayBuffer" in v)
        .slice(0, MAX_IMAGES);
    } else {
      body = (await req.json()) as CreateBody;
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!isTruthyFlag(body.confirmNotVessel)) {
    return NextResponse.json(
      { error: "You must confirm this listing is boat equipment or gear, not a boat or hull." },
      { status: 400 },
    );
  }

  const kindRaw = typeof body.kind === "string" ? body.kind : "";
  const kind: GearListingKind = isGearListingKind(kindRaw) ? kindRaw : "sale";
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
  const id = newListingId();

  const urls: string[] = [];
  if (imageFiles.length) {
    if (imageFiles.length > MAX_IMAGES) {
      return NextResponse.json({ error: `Please add up to ${MAX_IMAGES} images.` }, { status: 400 });
    }
    const parts: { buffer: Buffer; contentType: string }[] = [];
    for (const f of imageFiles) {
      const ext = extFromContentType(f.type || "");
      if (!ext) return NextResponse.json({ error: "Images must be JPG, PNG, or WebP." }, { status: 400 });
      if (f.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Each image must be 3 MB or smaller." }, { status: 400 });
      }
      parts.push({ buffer: Buffer.from(await f.arrayBuffer()), contentType: f.type || "image/jpeg" });
    }
    urls.push(...(await persistListingImages("gear", id, parts)));
  }

  const row: GearListing = {
    id,
    sellerUid: uid,
    kind,
    title: title.trim(),
    description: description.trim(),
    categoryId: categoryId as GearCategoryId,
    priceLabel,
    imageUrls: urls,
    createdAt: now.toISOString(),
    expiresAt: defaultExpiresAt(now),
    soldAt: null,
    reminderSentAt: null,
  };

  await appendListing(row);

  return NextResponse.json({ listing: toPublicListing(row, [uid]) });
}
