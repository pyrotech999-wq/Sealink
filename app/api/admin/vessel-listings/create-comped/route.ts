import { NextResponse } from "next/server";
import { requireAuthUser, uidFromEmail, normaliseEmail } from "@/lib/auth";
import { buildDraftListing, appendVesselListing } from "@/lib/vessel-classifieds-store";
import { persistListingImages } from "@/lib/listing-uploads";
import { parseVesselClassifiedFormData } from "@/lib/vessel-classifieds-form-parse";
import { applyComplimentaryActive } from "@/lib/vessel-classifieds-activate";
import { toPublicVesselListing } from "@/lib/vessel-classifieds-public";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const u = await requireAuthUser().catch(() => null);
  if (!u?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ error: "Use multipart/form-data" }, { status: 400 });
  }

  const fd = await req.formData();
  const ownerEmailRaw = typeof fd.get("ownerEmail") === "string" ? String(fd.get("ownerEmail")).trim() : "";
  const ownerEmail = normaliseEmail(ownerEmailRaw);
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return NextResponse.json({ error: "Valid ownerEmail required (seller sign-in email)." }, { status: 400 });
  }

  const parsed = parseVesselClassifiedFormData(fd);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const ownerUid = uidFromEmail(ownerEmail);
  const row = buildDraftListing(ownerUid);
  const { title, description, categoryId, locationLabel, makeModel, year, lengthFt, priceGbp, files } = parsed.data;
  row.title = title;
  row.description = description;
  row.categoryId = categoryId;
  row.locationLabel = locationLabel ? locationLabel.slice(0, 80) : null;
  row.makeModel = makeModel ? makeModel.slice(0, 80) : null;
  row.year = year;
  row.lengthFt = lengthFt;
  row.priceGbp = priceGbp;

  if (files.length) {
    const parts = await Promise.all(
      files.map(async (f) => ({
        buffer: Buffer.from(await f.arrayBuffer()),
        contentType: f.type || "image/jpeg",
      })),
    );
    row.imageUrls = await persistListingImages("vessel", row.id, parts);
  }

  const active = applyComplimentaryActive(row, "comp", `admin-create:${u.email}`);
  await appendVesselListing(active);
  return NextResponse.json({ listing: toPublicVesselListing(active, ownerUid), ownerUid, ownerEmail });
}
