import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { buildDraftListing, appendVesselListing, loadVesselClassifieds, updateVesselListing, adminUpdateVesselListing } from "@/lib/vessel-classifieds-store";
import { isVesselCategoryId, type VesselCategoryId } from "@/lib/vessel-classifieds-types";
import { toPublicVesselListing } from "@/lib/vessel-classifieds-public";
import { persistListingImages } from "@/lib/listing-uploads";
import { parseVesselClassifiedFormData } from "@/lib/vessel-classifieds-form-parse";
import { applyComplimentaryActive } from "@/lib/vessel-classifieds-activate";
import { consumeOneSlot } from "@/lib/vessel-freelisting-store";

export const runtime = "nodejs";

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
  const parsed = parseVesselClassifiedFormData(fd);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const useFreeSlot =
    fd.get("useFreeSlot") === "1" ||
    fd.get("useFreeSlot") === "true" ||
    String(fd.get("useFreeSlot") ?? "").toLowerCase() === "on";

  const { title, description, categoryId, locationLabel, makeModel, year, lengthFt, priceGbp, contactEmail, contactPhone, contactPhonePublic, files } =
    parsed.data;

  const row = buildDraftListing(u.uid);
  row.title = title;
  row.description = description;
  row.categoryId = categoryId;
  row.locationLabel = locationLabel ? locationLabel.slice(0, 80) : null;
  row.makeModel = makeModel ? makeModel.slice(0, 80) : null;
  row.year = year;
  row.lengthFt = lengthFt;
  row.priceGbp = priceGbp;
  row.contactEmail = contactEmail.slice(0, 200);
  row.contactPhone = contactPhone ? contactPhone.slice(0, 40) : null;
  row.contactPhonePublic = Boolean(contactPhonePublic);

  if (files.length) {
    const parts = await Promise.all(
      files.map(async (f) => ({
        buffer: Buffer.from(await f.arrayBuffer()),
        contentType: f.type || "image/jpeg",
      })),
    );
    row.imageUrls = await persistListingImages("vessel", row.id, parts);
  }

  if (useFreeSlot) {
    const consumed = await consumeOneSlot(u.uid);
    if (!consumed) {
      return NextResponse.json({ error: "No complimentary listing slots available. Redeem a code first." }, { status: 400 });
    }
    const active = applyComplimentaryActive(row, "promo", "promo-slot");
    await appendVesselListing(active);
    return NextResponse.json({ listing: toPublicVesselListing(active, u.uid) });
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
  contactEmail?: unknown;
  contactPhone?: unknown;
  contactPhonePublic?: unknown;
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
    const nextEmail = typeof body.contactEmail === "string" ? body.contactEmail.trim() : l.contactEmail ?? "";
    if (nextEmail.length < 6 || nextEmail.length > 200) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) return null;
    const nextPhone = typeof body.contactPhone === "string" ? body.contactPhone.trim().slice(0, 40) : l.contactPhone;
    const nextPhonePublic =
      body.contactPhonePublic === true ||
      body.contactPhonePublic === "1" ||
      body.contactPhonePublic === "true" ||
      String(body.contactPhonePublic ?? "").toLowerCase() === "on"
        ? true
        : body.contactPhonePublic === false
          ? false
          : l.contactPhonePublic;
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
      contactEmail: nextEmail,
      contactPhone: nextPhone || null,
      contactPhonePublic: nextPhonePublic,
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

