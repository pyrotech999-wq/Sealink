import { distanceKm } from "@/lib/geo-haversine";
import { MARINA_WORLD_CATALOG, type MarinaListing } from "@/lib/marina-catalog";
import { reverseGeocodePlace } from "@/lib/reverse-geocode-nominatim";

const MAX_MARINA_KM = 100;
/** Prefer marina/harbour name on the tide card when this close. */
const MARINA_LABEL_PRIORITY_KM = 40;

export type SeaTideContext = {
  /** Primary label for tides (harbour, marina, or town). */
  displayLabel: string;
  /** Longer line for UI (marina + region, or full geocode). */
  detail: string;
  via: "marina" | "place";
  nearestMarina: {
    name: string;
    harbour: string;
    region: string;
    country: string;
    distanceKm: number;
  } | null;
  nominatim: { label: string; country?: string } | null;
};

function nearestMarina(lat: number, lng: number): (MarinaListing & { distanceKm: number }) | null {
  let best: (MarinaListing & { distanceKm: number }) | null = null;
  let bestKm = Infinity;
  for (const m of MARINA_WORLD_CATALOG) {
    const d = distanceKm(lat, lng, m.lat, m.lng);
    if (d < bestKm) {
      bestKm = d;
      best = { ...m, distanceKm: d };
    }
  }
  if (!best || best.distanceKm > MAX_MARINA_KM) return null;
  return best;
}

/** Harbour / town context for tide copy — marinas & harbours first, then Nominatim place. */
export async function resolveSeaTideContext(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<SeaTideContext> {
  const marina = nearestMarina(lat, lng);
  const nom = await reverseGeocodePlace(lat, lng, signal);

  if (marina && marina.distanceKm <= MARINA_LABEL_PRIORITY_KM) {
    const harbour = marina.harbour.trim();
    const name = marina.name.trim();
    const label = (harbour || name).trim() || "Marina";
    const parts = [name, harbour && harbour !== name ? harbour : null, marina.region, marina.country].filter(
      (x): x is string => Boolean(x && String(x).trim()),
    );
    const detail = parts.join(" · ");
    return {
      displayLabel: label,
      detail: detail || label,
      via: "marina",
      nearestMarina: {
        name: marina.name,
        harbour: marina.harbour,
        region: marina.region,
        country: marina.country,
        distanceKm: Math.round(marina.distanceKm * 10) / 10,
      },
      nominatim: nom,
    };
  }

  if (nom?.label) {
    const short = nom.label.split(",")[0]?.trim() || nom.label;
    const detail = nom.label;
    return {
      displayLabel: short,
      detail,
      via: "place",
      nearestMarina: marina
        ? {
            name: marina.name,
            harbour: marina.harbour,
            region: marina.region,
            country: marina.country,
            distanceKm: Math.round(marina.distanceKm * 10) / 10,
          }
        : null,
      nominatim: nom,
    };
  }

  if (marina) {
    const harbour = marina.harbour.trim();
    const name = marina.name.trim();
    const label = (harbour || name).trim() || "Marina";
    const detail = [name, marina.region, marina.country].filter(Boolean).join(" · ");
    return {
      displayLabel: label,
      detail,
      via: "marina",
      nearestMarina: {
        name: marina.name,
        harbour: marina.harbour,
        region: marina.region,
        country: marina.country,
        distanceKm: Math.round(marina.distanceKm * 10) / 10,
      },
      nominatim: null,
    };
  }

  return {
    displayLabel: "Your position",
    detail: "Open sea — no named harbour in range",
    via: "place",
    nearestMarina: null,
    nominatim: null,
  };
}

export function tideDisplayTimeZone(ctx: SeaTideContext): string {
  const c =
    ctx.nominatim?.country?.toLowerCase() ||
    ctx.nearestMarina?.country?.toLowerCase() ||
    "";
  if (c.includes("ireland")) return "Europe/Dublin";
  if (c.includes("united kingdom") || c.includes("uk")) return "Europe/London";
  if (c.includes("france")) return "Europe/Paris";
  if (c.includes("netherlands")) return "Europe/Amsterdam";
  if (c.includes("spain") || c.includes("portugal")) return "Europe/Madrid";
  if (c.includes("united states") || c.includes("usa")) return "America/New_York";
  return "UTC";
}
