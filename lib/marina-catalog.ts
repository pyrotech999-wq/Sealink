import marinasWorld from "@/data/marinas-world.json";

export type MarinaListing = {
  id: string;
  name: string;
  harbour: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
  priceFromEur: number;
  maxLengthM: number;
  depthM: number;
  facilities: string[];
  description: string;
  phone: string;
};

function asListing(m: unknown): MarinaListing | null {
  if (!m || typeof m !== "object") return null;
  const r = m as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.lat !== "number" || typeof r.lng !== "number") return null;
  return m as MarinaListing;
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
  return [...new Set(MARINA_WORLD_CATALOG.map((m) => m.country))].sort((a, b) => a.localeCompare(b));
}

/** Normalise for `tel:` — strip spaces; keep leading + and digits. */
export function marinaTelHref(phone: string): string {
  const t = phone.trim();
  if (!t) return "";
  const compact = t.replace(/\s/g, "");
  return `tel:${compact}`;
}
