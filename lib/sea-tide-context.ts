import { distanceKm } from "@/lib/geo-haversine";
import { MARINA_WORLD_CATALOG, type MarinaListing } from "@/lib/marina-catalog";
import { reverseGeocodePlace } from "@/lib/reverse-geocode-nominatim";

const MAX_MARINA_KM = 100;
/** Marinas within this radius (miles) anchor tide API queries and get label priority over generic reverse-geocode. */
export const TIDE_NEARBY_MARINA_RADIUS_MILES = 25;
const TIDE_NEARBY_MARINA_RADIUS_KM = TIDE_NEARBY_MARINA_RADIUS_MILES * 1.609344;

export type TideQueryPoint = {
  lat: number;
  lng: number;
  /** Tide APIs use marina coordinates when within ~25 mi; otherwise the user’s fix. */
  source: "user" | "marina";
  marinaName: string | null;
  /** Distance from user fix to this point (km). */
  offsetKm: number;
};

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
  tideQuery: TideQueryPoint;
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

function tideQueryFor(lat: number, lng: number, marina: (MarinaListing & { distanceKm: number }) | null): TideQueryPoint {
  if (marina && marina.distanceKm <= TIDE_NEARBY_MARINA_RADIUS_KM) {
    return {
      lat: marina.lat,
      lng: marina.lng,
      source: "marina",
      marinaName: marina.name.trim() || null,
      offsetKm: Math.round(marina.distanceKm * 100) / 100,
    };
  }
  return { lat, lng, source: "user", marinaName: null, offsetKm: 0 };
}

/** Harbour / town context for tide copy — marinas & harbours within ~25 mi first, then Nominatim place. */
export async function resolveSeaTideContext(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<SeaTideContext> {
  const marina = nearestMarina(lat, lng);
  const tideQuery = tideQueryFor(lat, lng, marina);
  const nom = await reverseGeocodePlace(lat, lng, signal);

  if (marina && marina.distanceKm <= TIDE_NEARBY_MARINA_RADIUS_KM) {
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
      tideQuery,
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
      tideQuery,
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
      tideQuery,
    };
  }

  return {
    displayLabel: "Your position",
    detail: "Open sea — no named harbour in range",
    via: "place",
    nearestMarina: null,
    nominatim: null,
    tideQuery,
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
