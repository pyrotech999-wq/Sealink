import { distanceMiles } from "@/lib/geo-haversine";
import type { MarinaListing } from "@/lib/marina-types";

export type MarinaQueryParams = {
  country?: string;
  q?: string;
  boatLengthM?: number | null;
  userLat?: number | null;
  userLng?: number | null;
  /** Statute miles; >= 9000 means no distance filter (still sorted by distance when position set). */
  radiusMi?: number;
  limit?: number;
};

export function filterMarinaList(catalog: readonly MarinaListing[], p: MarinaQueryParams): MarinaListing[] {
  const limit = Math.min(Math.max(p.limit ?? 250, 1), 400);
  const q = (p.q ?? "").trim().toLowerCase();
  const country = (p.country ?? "").trim();
  const len = p.boatLengthM;
  const lenOk = len != null && Number.isFinite(len) && len > 0;
  const userLat = p.userLat;
  const userLng = p.userLng;
  const hasPos =
    userLat != null && userLng != null && Number.isFinite(userLat) && Number.isFinite(userLng);
  const radiusMi = p.radiusMi ?? 250;

  let list = catalog.filter((m) => {
    if (country && m.country !== country) return false;
    if (q) {
      const blob = `${m.name} ${m.harbour} ${m.region} ${m.country}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (lenOk && m.maxLengthM != null && len! > m.maxLengthM) return false;
    return true;
  });

  if (hasPos) {
    const tagged = list.map((m) => ({
      m,
      mi: distanceMiles(userLat!, userLng!, m.lat, m.lng),
    }));
    const within = radiusMi >= 9000 ? tagged : tagged.filter((t) => t.mi <= radiusMi);
    within.sort((a, b) => a.mi - b.mi);
    list = within.map((t) => t.m);
  }

  return list.slice(0, limit);
}
