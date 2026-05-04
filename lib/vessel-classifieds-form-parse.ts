import { isVesselCategoryId, type VesselCategoryId } from "@/lib/vessel-classifieds-types";

export const VESSEL_FORM_MAX_IMAGES = 3;
export const VESSEL_FORM_MAX_IMAGE_BYTES = 3 * 1024 * 1024;

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

export type ParsedVesselForm = {
  title: string;
  description: string;
  categoryId: VesselCategoryId;
  locationLabel: string;
  makeModel: string;
  year: number | null;
  lengthFt: number | null;
  priceGbp: number | null;
  files: File[];
};

export function parseVesselClassifiedFormData(fd: FormData): { ok: true; data: ParsedVesselForm } | { ok: false; error: string; status: number } {
  const title = typeof fd.get("title") === "string" ? String(fd.get("title")) : "";
  const description = typeof fd.get("description") === "string" ? String(fd.get("description")) : "";
  const categoryId = typeof fd.get("categoryId") === "string" ? String(fd.get("categoryId")) : "";
  const locationLabel = typeof fd.get("locationLabel") === "string" ? String(fd.get("locationLabel")).trim() : "";
  const makeModel = typeof fd.get("makeModel") === "string" ? String(fd.get("makeModel")).trim() : "";

  const year = num(fd.get("year"));
  const lengthFt = num(fd.get("lengthFt"));
  const priceGbp = num(fd.get("priceGbp"));

  if (!isVesselCategoryId(categoryId)) return { ok: false, error: "Invalid category", status: 400 };
  if (title.trim().length < 5 || title.trim().length > 160) return { ok: false, error: "Title must be 5–160 characters.", status: 400 };
  if (description.trim().length < 30 || description.trim().length > 12_000) {
    return { ok: false, error: "Description must be 30–12,000 characters.", status: 400 };
  }

  const files = fd
    .getAll("images")
    .filter((v): v is File => typeof v === "object" && v != null && "arrayBuffer" in v)
    .slice(0, VESSEL_FORM_MAX_IMAGES);

  for (const f of files) {
    const ext = extFromContentType(f.type || "");
    if (!ext) return { ok: false, error: "Images must be JPG, PNG, or WebP.", status: 400 };
    if (f.size > VESSEL_FORM_MAX_IMAGE_BYTES) return { ok: false, error: "Each image must be 3 MB or smaller.", status: 400 };
  }

  return {
    ok: true,
    data: {
      title: title.trim(),
      description: description.trim(),
      categoryId,
      locationLabel,
      makeModel,
      year: year != null ? Math.max(1900, Math.min(2100, Math.round(year))) : null,
      lengthFt: lengthFt != null ? Math.max(0, Math.min(300, Math.round(lengthFt * 10) / 10)) : null,
      priceGbp: priceGbp != null ? Math.max(0, Math.min(999_999_999, Math.round(priceGbp * 100) / 100)) : null,
      files,
    },
  };
}
