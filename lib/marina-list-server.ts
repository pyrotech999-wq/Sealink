import { MARINA_WORLD_CATALOG } from "@/lib/marina-catalog";
import { marinaRowToListing } from "@/lib/marina-map-db";
import { filterMarinaList, type MarinaQueryParams } from "@/lib/marina-query";
import type { MarinaListing } from "@/lib/marina-types";
import { distanceMiles } from "@/lib/geo-haversine";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function marinasTableHasRows(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const sb = supabaseAdmin();
    const { count, error } = await sb.from("marinas").select("*", { count: "exact", head: true });
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

function bboxForRadiusMi(lat: number, lng: number, radiusMi: number): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const dLat = radiusMi / 69;
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLng = radiusMi / (69 * Math.max(0.2, Math.abs(cos)));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

async function queryMarinasFromSupabase(p: MarinaQueryParams): Promise<MarinaListing[]> {
  const sb = supabaseAdmin();
  const limit = Math.min(Math.max(p.limit ?? 250, 1), 2000);
  const radiusMi = p.radiusMi ?? 250;
  const q = (p.q ?? "").trim();
  const country = (p.country ?? "").trim();
  const userLat = p.userLat;
  const userLng = p.userLng;
  const hasPos =
    userLat != null && userLng != null && Number.isFinite(userLat) && Number.isFinite(userLng);

  let query = sb.from("marinas").select("*");

  if (country) {
    query = query.eq("country", country);
  }

  if (hasPos && radiusMi < 9000) {
    const { minLat, maxLat, minLng, maxLng } = bboxForRadiusMi(userLat!, userLng!, radiusMi);
    query = query.gte("lat", minLat).lte("lat", maxLat).gte("lng", minLng).lte("lng", maxLng);
  }

  query = query.order("name", { ascending: true }).limit(1200);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data ?? [])
    .map((row) => marinaRowToListing(row as Record<string, unknown>))
    .filter(Boolean) as MarinaListing[];

  if (q.length >= 2) {
    const ql = q.toLowerCase();
    rows = rows.filter((m) => {
      const blob = `${m.name} ${m.harbour} ${m.region} ${m.country}`.toLowerCase();
      return blob.includes(ql);
    });
  }

  const len = p.boatLengthM;
  const lenOk = len != null && Number.isFinite(len) && len > 0;
  if (lenOk) {
    rows = rows.filter((m) => m.maxLengthM == null || len! <= m.maxLengthM);
  }

  if (hasPos) {
    const tagged = rows.map((m) => ({
      m,
      mi: distanceMiles(userLat!, userLng!, m.lat, m.lng),
    }));
    const within = radiusMi >= 9000 ? tagged : tagged.filter((t) => t.mi <= radiusMi);
    within.sort((a, b) => a.mi - b.mi);
    rows = within.map((t) => t.m);
  } else {
    rows.sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (byName !== 0) return byName;
      return a.harbour.localeCompare(b.harbour, undefined, { sensitivity: "base" });
    });
  }

  return rows.slice(0, limit);
}

export async function listMarinasMerged(p: MarinaQueryParams): Promise<{ marinas: MarinaListing[]; source: "supabase" | "seed" }> {
  const useDb = (await marinasTableHasRows()) && isSupabaseConfigured();

  if (useDb) {
    try {
      const marinas = await queryMarinasFromSupabase(p);
      if (marinas.length > 0) return { marinas, source: "supabase" };
    } catch {
      /* fallback */
    }
  }

  return {
    marinas: filterMarinaList(MARINA_WORLD_CATALOG, p),
    source: "seed",
  };
}

export async function listMarinaCountriesMerged(): Promise<string[]> {
  const seed = [...new Set(MARINA_WORLD_CATALOG.map((m) => m.country))].filter(Boolean);
  if (!isSupabaseConfigured()) return seed.sort((a, b) => a.localeCompare(b));

  try {
    const sb = supabaseAdmin();
    const { count } = await sb.from("marinas").select("*", { count: "exact", head: true });
    if (!count || count === 0) return seed.sort((a, b) => a.localeCompare(b));

    const { data, error } = await sb.from("marinas").select("country");
    if (error) return seed.sort((a, b) => a.localeCompare(b));
    const fromDb = [...new Set((data ?? []).map((r) => (r as { country?: string }).country).filter(Boolean))] as string[];
    const merged = [...new Set([...seed, ...fromDb])];
    return merged.sort((a, b) => a.localeCompare(b));
  } catch {
    return seed.sort((a, b) => a.localeCompare(b));
  }
}
