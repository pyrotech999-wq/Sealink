export type PlaceSummary = {
  label: string;
  country?: string;
};

/** Human-readable place from coordinates (Nominatim — use sparingly; identify app in User-Agent). */
export async function reverseGeocodePlace(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<PlaceSummary | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "12");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://localhost";
  const res = await fetch(url.toString(), {
    signal,
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": `SeaLink/1.0 (${appUrl})`,
    },
    cache: "no-store",
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    address?: Record<string, string | undefined>;
    display_name?: string;
  };
  const a = data.address;
  if (!a) {
    const dn = data.display_name?.split(",").slice(0, 2).join(",").trim();
    return dn ? { label: dn } : null;
  }

  /** Prefer smaller localities so coastal fixes are not swallowed by a distant admin city. */
  const town =
    a.hamlet ||
    a.village ||
    a.town ||
    a.suburb ||
    a.neighbourhood ||
    a.city ||
    a.municipality ||
    a.county ||
    a.state_district ||
    a.state;
  const country = a.country;
  if (town && country && town !== country) {
    return { label: `${town}, ${country}`, country };
  }
  if (town) return { label: town, country: country ?? undefined };
  if (country) return { label: country, country };
  return null;
}
