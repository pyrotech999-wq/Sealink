import type { MarinaListing } from "@/lib/marina-types";

export function marinaRowToListing(r: Record<string, unknown>): MarinaListing | null {
  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  const lat = typeof r.lat === "number" ? r.lat : Number(r.lat);
  const lng = typeof r.lng === "number" ? r.lng : Number(r.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const facilities = Array.isArray(r.facilities)
    ? (r.facilities as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  const price = r.price_from_eur;
  const maxL = r.max_length_m;
  const depth = r.depth_m;

  return {
    id: r.id,
    name: r.name,
    harbour: typeof r.harbour === "string" ? r.harbour : "",
    region: typeof r.region === "string" ? r.region : "",
    country: typeof r.country === "string" ? r.country : "",
    lat,
    lng,
    priceFromEur: price == null || price === "" ? null : Number(price),
    maxLengthM: maxL == null || maxL === "" ? null : Number(maxL),
    depthM: depth == null || depth === "" ? null : Number(depth),
    facilities,
    description: typeof r.description === "string" ? r.description : "",
    phone: typeof r.phone === "string" ? r.phone : "",
  };
}
