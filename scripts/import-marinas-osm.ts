/**
 * Import marinas from OpenStreetMap (leisure=marina) into Supabase via Overpass API.
 *
 * Prerequisites:
 *   - Run supabase/migrations/005_marinas.sql
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage:
 *   npx tsx scripts/import-marinas-osm.ts                    # default country set (~30 ISO codes)
 *   npx tsx scripts/import-marinas-osm.ts --countries=GB,FR,ES
 *   npx tsx scripts/import-marinas-osm.ts --dry-run         # print counts only
 *
 * Be polite: uses ~2.5s delay between Overpass calls. Large countries can return many features;
 * rows are capped per country (see MAX_PER_COUNTRY).
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";

config({ path: path.join(process.cwd(), ".env.local") });
config({ path: path.join(process.cwd(), ".env") });

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const MAX_PER_COUNTRY = 3500;
const BATCH = 150;
const DELAY_MS = 2500;

const ISO_TO_NAME: Record<string, string> = {
  GB: "United Kingdom",
  IE: "Ireland",
  FR: "France",
  ES: "Spain",
  PT: "Portugal",
  IT: "Italy",
  GR: "Greece",
  HR: "Croatia",
  SI: "Slovenia",
  ME: "Montenegro",
  AL: "Albania",
  NO: "Norway",
  SE: "Sweden",
  DK: "Denmark",
  DE: "Germany",
  NL: "Netherlands",
  BE: "Belgium",
  PL: "Poland",
  FI: "Finland",
  EE: "Estonia",
  LV: "Latvia",
  MT: "Malta",
  CY: "Cyprus",
  TR: "Turkey",
  TN: "Tunisia",
  MA: "Morocco",
  GI: "Gibraltar",
  IS: "Iceland",
  CA: "Canada",
  US: "United States",
  MX: "Mexico",
  BS: "Bahamas",
  BZ: "Belize",
  KY: "Cayman Islands",
  TT: "Trinidad and Tobago",
  PA: "Panama",
  BR: "Brazil",
  AU: "Australia",
  NZ: "New Zealand",
  JP: "Japan",
  KR: "South Korea",
  TW: "Taiwan",
  SG: "Singapore",
  TH: "Thailand",
  MY: "Malaysia",
  ZA: "South Africa",
  MU: "Mauritius",
  SC: "Seychelles",
  AE: "United Arab Emirates",
  IL: "Israel",
  EG: "Egypt",
};

const DEFAULT_ISOS = Object.keys(ISO_TO_NAME);

const DRY = process.argv.includes("--dry-run") || process.argv.includes("--dry");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseCountriesArg(): string[] {
  const raw = process.argv.find((a) => a.startsWith("--countries="));
  if (!raw) return DEFAULT_ISOS;
  const body = raw.slice("--countries=".length);
  return body
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function overpassQuery(iso: string): string {
  return `
[out:json][timeout:300];
area["ISO3166-1"="${iso}"]->.a;
(
  node["leisure"="marina"](area.a);
  way["leisure"="marina"](area.a);
  relation["leisure"="marina"](area.a);
);
out center tags;
`.trim();
}

type OsmTags = Record<string, string>;

function tagsToFacilities(tags: OsmTags): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  if (tags.drinking_water === "yes" || tags.water_tap === "yes" || tags.water === "yes") add("Water");
  if (tags.electricity === "yes" || tags.power_supply === "yes") add("Electricity");
  if (tags.internet_access === "wlan" || tags.internet_access === "wifi" || tags.internet_access === "yes")
    add("Wi‑Fi");
  if (tags.shower === "yes") add("Showers");
  if (tags.fuel === "yes" || tags.amenity === "fuel") add("Fuel nearby");
  if (tags.toilets === "yes") add("Toilets");
  if (tags.laundry === "yes") add("Laundry");
  if (out.length === 0) add("Water");
  if (out.length === 1) add("Electricity");
  return out;
}

function parseMaxLengthM(tags: OsmTags): number | null {
  const raw = tags.maxlength || tags.max_length || tags["maxstay"] || "";
  const m = raw.match(/(\d+(\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function osmTypePrefix(t: string): string {
  if (t === "node") return "n";
  if (t === "way") return "w";
  if (t === "relation") return "r";
  return "x";
}

function rowFromElement(
  el: { type: string; id: number; tags?: OsmTags; lat?: number; lon?: number; center?: { lat: number; lon: number } },
  iso: string,
): Record<string, unknown> | null {
  const tags = el.tags ?? {};
  let lat: number | undefined;
  let lon: number | undefined;
  if (el.type === "node") {
    lat = el.lat;
    lon = el.lon;
  } else if (el.center) {
    lat = el.center.lat;
    lon = el.center.lon;
  }
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const name =
    tags.name || tags["name:en"] || tags["name:fr"] || tags["name:es"] || tags["name:de"] || "Marina";
  const country = ISO_TO_NAME[iso] ?? iso;
  const region = tags["addr:state"] || tags["addr:province"] || tags["addr:region"] || "";
  const harbour = tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || name;
  const phone = tags.phone || tags["contact:phone"] || "";
  const id = `osm-${osmTypePrefix(el.type)}-${el.id}`;

  return {
    id,
    source: "osm",
    osm_type: el.type,
    osm_id: el.id,
    name,
    harbour,
    region,
    country,
    country_code: iso,
    lat,
    lng: lon,
    price_from_eur: null,
    max_length_m: parseMaxLengthM(tags),
    depth_m: null,
    facilities: tagsToFacilities(tags),
    description: `OpenStreetMap leisure=marina — verify berth, depth, and tariffs with the harbour office.`,
    phone,
    raw_tags: tags,
  };
}

async function main() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const isos = parseCountriesArg();

  console.log(`OSM marina import — countries: ${isos.length}${DRY ? " (dry run)" : ""}`);

  if (!DRY && (!url || !key)) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const sb = DRY ? null : createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let total = 0;

  for (const iso of isos) {
    if (!ISO_TO_NAME[iso]) {
      console.warn(`[skip] Unknown ISO code (add to ISO_TO_NAME): ${iso}`);
      continue;
    }

    const q = overpassQuery(iso);
    let elements: unknown[] = [];
    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Accept: "application/json",
          "User-Agent": "SeaLink-marina-import/1.0",
        },
        body: q,
      });
      if (!res.ok) {
        console.error(`[error] ${iso}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { elements?: unknown[] };
      elements = json.elements ?? [];
    } catch (e) {
      console.error(`[error] ${iso}:`, e);
      continue;
    }

    const rows: Record<string, unknown>[] = [];
    for (const el of elements) {
      if (!el || typeof el !== "object") continue;
      const o = el as { type?: string; id?: number };
      if (o.type !== "node" && o.type !== "way" && o.type !== "relation") continue;
      if (typeof o.id !== "number") continue;
      const row = rowFromElement(
        el as {
          type: string;
          id: number;
          tags?: OsmTags;
          lat?: number;
          lon?: number;
          center?: { lat: number; lon: number };
        },
        iso,
      );
      if (row) rows.push(row);
      if (rows.length >= MAX_PER_COUNTRY) break;
    }

    console.log(`[${iso}] ${rows.length} marinas`);
    total += rows.length;

    if (DRY || !sb) continue;

    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await sb.from("marinas").upsert(chunk, { onConflict: "id" });
      if (error) {
        console.error(`[error] ${iso} upsert:`, error.message);
        process.exit(1);
      }
    }

    await sleep(DELAY_MS);
  }

  console.log(DRY ? `Dry run complete — would process up to ${total} rows.` : `Done. Upserted ~${total} marina rows total.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
