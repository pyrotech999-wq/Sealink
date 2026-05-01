import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { buildDraftListing, appendVesselListing, loadVesselClassifieds, updateVesselListing, adminUpdateVesselListing } from "@/lib/vessel-classifieds-store";
import { isVesselCategoryId, type VesselCategoryId } from "@/lib/vessel-classifieds-types";
import { toPublicVesselListing } from "@/lib/vessel-classifieds-public";
import { persistListingImages } from "@/lib/listing-uploads";

export const runtime = "nodejs";

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function extFromContentType(ct: string): string | null {
  const c = ct.toLowerCase();
  if (c === "image/jpeg" || c === "image/jpg") return "jpg";
  if (c === "image/png") return "png";
  if (c === "image/webp") return "webp";
  return null;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const u = await requireAuthUser().catch(() => null);
  const viewerUid = u?.uid ?? "";

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const cat = url.searchParams.get("category") ?? "";
  const scope = url.searchParams.get("scope") ?? "";

  let rows = await loadVesselClassifieds();
  if (scope === "mine") {
    if (!viewerUid) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
    rows = rows.filter((l) => l.ownerUid === viewerUid && l.status !== "removed");
  } else {
    rows = rows.filter((l) => l.status === "active");
  }

  if (cat && isVesselCategoryId(cat)) rows = rows.filter((l) => l.categoryId === cat);
  if (q) rows = rows.filter((l) => l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q));

  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ listings: rows.map((l) => toPublicVesselListing(l, viewerUid)) });
}

export async function POST(req: Request) {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ error: "Use multipart/form-data" }, { status: 400 });
  }

  const fd = await req.formData();
  const title = typeof fd.get("title") === "string" ? String(fd.get("title")) : "";
  const description = typeof fd.get("description") === "string" ? String(fd.get("description")) : "";
  const categoryId = typeof fd.get("categoryId") === "string" ? String(fd.get("categoryId")) : "";
  const locationLabel = typeof fd.get("locationLabel") === "string" ? String(fd.get("locationLabel")).trim() : "";
  const makeModel = typeof fd.get("makeModel") === "string" ? String(fd.get("makeModel")).trim() : "";

  const year = num(fd.get("year"));
  const lengthFt = num(fd.get("lengthFt"));
  const priceGbp = num(fd.get("priceGbp"));

  if (!isVesselCategoryId(categoryId)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  if (title.trim().length < 5 || title.trim().length > 160) return NextResponse.json({ error: "Title must be 5–160 characters." }, { status: 400 });
  if (description.trim().length < 30 || description.trim().length > 12_000) return NextResponse.json({ error: "Description must be 30–12,000 characters." }, { status: 400 });

  const files = fd
    .getAll("images")
    .filter((v): v is File => typeof v === "object" && v != null && "arrayBuffer" in v)
    .slice(0, MAX_IMAGES);

  for (const f of files) {
    const ext = extFromContentType(f.type || "");
    if (!ext) return NextResponse.json({ error: "Images must be JPG, PNG, or WebP." }, { status: 400 });
    if (f.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Each image must be 3 MB or smaller." }, { status: 400 });
  }

  const row = buildDraftListing(u.uid);
  row.title = title.trim();
  row.description = description.trim();
  row.categoryId = categoryId as VesselCategoryId;
  row.locationLabel = locationLabel ? locationLabel.slice(0, 80) : null;
  row.makeModel = makeModel ? makeModel.slice(0, 80) : null;
  row.year = year != null ? Math.max(1900, Math.min(2100, Math.round(year))) : null;
  row.lengthFt = lengthFt != null ? Math.max(0, Math.min(300, Math.round(lengthFt * 10) / 10)) : null;
  row.priceGbp = priceGbp != null ? Math.max(0, Math.min(999_999_999, Math.round(priceGbp * 100) / 100)) : null;

  if (files.length) {
    const parts = await Promise.all(
      files.map(async (f) => ({
        buffer: Buffer.from(await f.arrayBuffer()),
        contentType: f.type || "image/jpeg",
      })),
    );
    row.imageUrls = await persistListingImages("vessel", row.id, parts);
  }

  await appendVesselListing(row);
  return NextResponse.json({ listing: toPublicVesselListing(row, u.uid) });
}

type UpdateBody = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  categoryId?: unknown;
  priceGbp?: unknown;
  locationLabel?: unknown;
  year?: unknown;
  lengthFt?: unknown;
  makeModel?: unknown;
};

export async function PATCH(req: Request) {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const all = await loadVesselClassifieds();
  const existing = all.find((l) => l.id === id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const apply = (l: typeof existing) => {
    if (l.status === "removed") return null;
    if (l.paymentStatus === "paid" && l.status === "active") return null; // edit rules can be expanded later
    const title = typeof body.title === "string" ? body.title : l.title;
    const description = typeof body.description === "string" ? body.description : l.description;
    const categoryId = typeof body.categoryId === "string" ? body.categoryId : l.categoryId;
    if (!isVesselCategoryId(String(categoryId))) return null;
    if (title.trim().length < 5 || title.trim().length > 160) return null;
    if (description.trim().length < 30 || description.trim().length > 12_000) return null;
    return {
      ...l,
      title: title.trim(),
      description: description.trim(),
      categoryId: String(categoryId) as VesselCategoryId,
      priceGbp: num(body.priceGbp) ?? l.priceGbp,
      locationLabel: typeof body.locationLabel === "string" ? body.locationLabel.trim().slice(0, 80) : l.locationLabel,
      year: num(body.year) ?? l.year,
      lengthFt: num(body.lengthFt) ?? l.lengthFt,
      makeModel: typeof body.makeModel === "string" ? body.makeModel.trim().slice(0, 80) : l.makeModel,
    };
  };

  const out = u.isAdmin ? await adminUpdateVesselListing(id, apply) : await updateVesselListing(id, u.uid, apply);
  if (!out.ok) return NextResponse.json({ error: out.error ?? "Could not update" }, { status: out.error === "Not allowed" ? 403 : 400 });

  const after = (await loadVesselClassifieds()).find((l) => l.id === id);
  if (!after) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ listing: toPublicVesselListing(after, u.uid) });
}

type DeleteBody = { id?: unknown };

export async function DELETE(req: Request) {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const all = await loadVesselClassifieds();
  const existing = all.find((l) => l.id === id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!u.isAdmin && existing.ownerUid !== u.uid) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const out = u.isAdmin
    ? await adminUpdateVesselListing(id, (l) => ({ ...l, status: "removed", removedAt: new Date().toISOString() }))
    : await updateVesselListing(id, u.uid, (l) => ({ ...l, status: "removed", removedAt: new Date().toISOString() }));

  if (!out.ok) return NextResponse.json({ error: out.error ?? "Could not remove" }, { status: 400 });
  return NextResponse.json({ ok: true as const });
}

