import marinasWorld from "@/data/marinas-world.json";
import type { MarinaListing } from "@/lib/marina-types";

export type { MarinaListing } from "@/lib/marina-types";

function num(x: unknown): number | null {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function asListing(m: unknown): MarinaListing | null {
  if (!m || typeof m !== "object") return null;
  const r = m as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.lat !== "number" || typeof r.lng !== "number") return null;
  const facilities = Array.isArray(r.facilities)
    ? (r.facilities as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  return {
    id: r.id,
    name: typeof r.name === "string" ? r.name : "",
    harbour: typeof r.harbour === "string" ? r.harbour : "",
    region: typeof r.region === "string" ? r.region : "",
    country: typeof r.country === "string" ? r.country : "",
    lat: r.lat,
    lng: r.lng,
    priceFromEur: num(r.priceFromEur),
    maxLengthM: num(r.maxLengthM),
    depthM: num(r.depthM),
    facilities,
    description: typeof r.description === "string" ? r.description : "",
    phone: typeof r.phone === "string" ? r.phone : "",
  };
}

const parsed = (Array.isArray(marinasWorld) ? marinasWorld : [])
  .map(asListing)
  .filter(Boolean) as MarinaListing[];

export const MARINA_WORLD_CATALOG: readonly MarinaListing[] = parsed;

/** @deprecated Use MARINA_WORLD_CATALOG */
export const MARINA_DEMO_CATALOG = MARINA_WORLD_CATALOG;

export function getMarinaById(id: string): MarinaListing | undefined {
  return MARINA_WORLD_CATALOG.find((m) => m.id === id);
}

export function marinaCountriesSorted(): string[] {
  return [...new Set(MARINA_WORLD_CATALOG.map((m) => m.country))].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/** Normalise for `tel:` — strip spaces; keep leading + and digits. */
export function marinaTelHref(phone: string): string {
  const t = phone.trim();
  if (!t) return "";
  const compact = t.replace(/\s/g, "");
  return `tel:${compact}`;
}
