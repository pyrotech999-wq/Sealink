/**
 * Import marinas from OpenStreetMap (leisure=marina) into Supabase via Overpass API.
 *
 * Prerequisites:
 *   - Run supabase/migrations/005_marinas.sql
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage (default world list = one country per run; progress in .marinas-osm-import-state.json):
 *   npm run marinas:import:osm              # next country (first run: GB); run again for IE, FR, …
 *   npx tsx scripts/import-marinas-osm.ts --reset-progress   # clear saved offset, then run import (one country by default)
 *   npm run marinas:import:osm:reset          # only deletes .marinas-osm-import-state.json (no Overpass call)
 *   npx tsx scripts/import-marinas-osm.ts --limit=3       # 3 countries this run, then save progress
 *   npx tsx scripts/import-marinas-osm.ts --offset=10     # override saved progress (manual jump)
 *   npx tsx scripts/import-marinas-osm.ts --all           # entire default set in one go (~44 ISO codes)
 *   npx tsx scripts/import-marinas-osm.ts --countries=GB,FR  # custom list (no auto progress file)
 *   npx tsx scripts/import-marinas-osm.ts --preset=europe-middle-east --limit=0  # EU + Middle East (use --limit=0 for whole preset)
 *   npm run marinas:import:osm:uk           # United Kingdom only
 *   npm run marinas:import:osm:eu-me        # preset europe-middle-east, all countries in one run
 *   npm run marinas:import:osm:row          # rest of world (catalog minus EU+ME), --limit=0
 *   npm run marinas:import:osm:all          # same as --all (entire catalog)
 *   npx tsx scripts/import-marinas-osm.ts --dry-run
 *
 * Be polite: uses ~2.5s delay between Overpass calls. Large countries can return many features;
 * rows are capped per country (see MAX_PER_COUNTRY).
 *
 * Overpass 504/503: the script retries with backoff, then skips that country and continues.
 * Optional: OVERPASS_URL in .env.local (default https://overpass-api.de/api/interpreter).
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

config({ path: path.join(process.cwd(), ".env.local") });
config({ path: path.join(process.cwd(), ".env") });

const OVERPASS_URL = (
  process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter"
).trim();
const MAX_PER_COUNTRY = 3500;
const BATCH = 150;
const DELAY_MS = 2500;
/** Transient Overpass / gateway responses worth retrying. */
const OVERPASS_RETRY_STATUS = new Set([408, 429, 502, 503, 504]);
const OVERPASS_MAX_ATTEMPTS = 5;

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
  AT: "Austria",
  CH: "Switzerland",
  CZ: "Czechia",
  SK: "Slovakia",
  HU: "Hungary",
  RO: "Romania",
  BG: "Bulgaria",
  RS: "Serbia",
  BA: "Bosnia and Herzegovina",
  MK: "North Macedonia",
  LU: "Luxembourg",
  LI: "Liechtenstein",
  AD: "Andorra",
  MC: "Monaco",
  SM: "San Marino",
  VA: "Vatican City",
  UA: "Ukraine",
  MD: "Moldova",
  LT: "Lithuania",
  BY: "Belarus",
  RU: "Russia",
  XK: "Kosovo",
  SA: "Saudi Arabia",
  QA: "Qatar",
  BH: "Bahrain",
  KW: "Kuwait",
  OM: "Oman",
  JO: "Jordan",
  LB: "Lebanon",
  SY: "Syria",
  IQ: "Iraq",
  IR: "Iran",
  YE: "Yemen",
  PS: "Palestine",
  GE: "Georgia",
  AM: "Armenia",
  AZ: "Azerbaijan",
};

/** Europe + Middle East (ISO 3166-1 alpha-2 for Overpass area["ISO3166-1"]). */
const PRESET_EUROPE_MIDDLE_EAST: string[] = [
  "AD",
  "AL",
  "AM",
  "AT",
  "AZ",
  "BA",
  "BE",
  "BG",
  "BH",
  "BY",
  "CH",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "EG",
  "ES",
  "FI",
  "FR",
  "GB",
  "GE",
  "GI",
  "GR",
  "HR",
  "HU",
  "IE",
  "IL",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JO",
  "KW",
  "LB",
  "LI",
  "LT",
  "LU",
  "LV",
  "MC",
  "MD",
  "ME",
  "MK",
  "MT",
  "NL",
  "NO",
  "OM",
  "PL",
  "PS",
  "PT",
  "QA",
  "RO",
  "RS",
  "RU",
  "SA",
  "SE",
  "SI",
  "SK",
  "SM",
  "SY",
  "TR",
  "UA",
  "AE",
  "VA",
  "XK",
  "YE",
];

const EUROPE_MIDDLE_EAST_ISO_SET = new Set(PRESET_EUROPE_MIDDLE_EAST);

/** Americas, Africa, Asia-Pacific, etc.: every ISO in the catalog not covered by europe-middle-east. */
const PRESET_REST_OF_WORLD: string[] = Object.keys(ISO_TO_NAME)
  .filter((iso) => !EUROPE_MIDDLE_EAST_ISO_SET.has(iso))
  .sort();

const DEFAULT_ISOS = Object.keys(ISO_TO_NAME);

/** One country per run by default — keeps Overpass + Supabase batches small; progress is saved locally. */
const DEFAULT_COUNTRY_LIMIT = 1;

const STATE_PATH = path.join(process.cwd(), ".marinas-osm-import-state.json");

const DRY = process.argv.includes("--dry-run") || process.argv.includes("--dry");

function usingDefaultCountryList(): boolean {
  return (
    !process.argv.some((a) => a.startsWith("--countries=")) &&
    !process.argv.some((a) => a.startsWith("--preset="))
  );
}

function parsePresetArg(): string[] | null {
  const raw = process.argv.find((a) => a.startsWith("--preset="));
  if (!raw) return null;
  const name = raw
    .slice("--preset=".length)
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  const map: Record<string, string[]> = {
    "europe-middle-east": PRESET_EUROPE_MIDDLE_EAST,
    "eu-me": PRESET_EUROPE_MIDDLE_EAST,
    "rest-of-world": PRESET_REST_OF_WORLD,
    row: PRESET_REST_OF_WORLD,
  };
  const isos = map[name];
  if (!isos) {
    console.error(`Unknown --preset=${name}. Use: ${Object.keys(map).join(", ")}`);
    process.exit(1);
  }
  return [...isos];
}

function loadSavedOffset(): number {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const j = JSON.parse(raw) as { nextOffset?: number };
    const n = j.nextOffset;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  } catch {
    return 0;
  }
}

function saveProgressOffset(nextOffset: number, totalCountries: number): void {
  const payload = {
    nextOffset,
    totalCountries,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function clearProgressFile(): void {
  try {
    fs.unlinkSync(STATE_PATH);
  } catch {
    /* none */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOverpassElements(
  iso: string,
  q: string,
): Promise<{ ok: true; elements: unknown[] } | { ok: false; detail: string }> {
  for (let attempt = 1; attempt <= OVERPASS_MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        const waitMs = Math.min(90_000, 4000 * 2 ** (attempt - 2));
        console.log(`[${iso}] Retry ${attempt}/${OVERPASS_MAX_ATTEMPTS} after ${Math.round(waitMs / 1000)}s…`);
        await sleep(waitMs);
      }
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Accept: "application/json",
          "User-Agent": "SeaLink-marina-import/1.0",
        },
        body: q,
      });
      if (res.ok) {
        const json = (await res.json()) as { elements?: unknown[] };
        return { ok: true, elements: json.elements ?? [] };
      }
      const status = res.status;
      const retryable = OVERPASS_RETRY_STATUS.has(status) && attempt < OVERPASS_MAX_ATTEMPTS;
      if (retryable) {
        console.warn(`[${iso}] HTTP ${status} — retrying (${attempt}/${OVERPASS_MAX_ATTEMPTS})`);
        continue;
      }
      return { ok: false, detail: `HTTP ${status}` };
    } catch (e) {
      if (attempt < OVERPASS_MAX_ATTEMPTS) {
        console.warn(`[${iso}] ${e instanceof Error ? e.message : String(e)} — retrying (${attempt}/${OVERPASS_MAX_ATTEMPTS})`);
        continue;
      }
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }
  return { ok: false, detail: "max retries exceeded" };
}

function parseCountriesArg(): string[] {
  const preset = parsePresetArg();
  const raw = process.argv.find((a) => a.startsWith("--countries="));
  if (preset && raw) {
    console.warn("[warn] Both --preset and --countries: using --countries (preset ignored).");
  }
  const list = raw
    ? raw
        .slice("--countries=".length)
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : preset
      ? preset
      : [...DEFAULT_ISOS];

  const unknown: string[] = [];
  const known = list.filter((iso) => {
    if (ISO_TO_NAME[iso]) return true;
    unknown.push(iso);
    return false;
  });
  for (const u of unknown) console.warn(`[skip] Unknown ISO code (add to ISO_TO_NAME): ${u}`);
  return known;
}

/** Explicit --offset=N wins; else default list uses saved progress. */
function resolveOffset(explicit: boolean, offsetArg: number, defaultList: boolean): number {
  if (explicit) return offsetArg;
  if (defaultList) return loadSavedOffset();
  return 0;
}

function parseOffsetArg(): { offset: number; explicit: boolean } {
  const raw = process.argv.find((a) => a.startsWith("--offset="));
  if (!raw) return { offset: 0, explicit: false };
  const n = Number(raw.slice("--offset=".length));
  return {
    offset: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0,
    explicit: true,
  };
}

/** Max countries this run: default 1, unless --all or --limit=0 (unlimited). */
function parseCountryLimit(): number {
  if (process.argv.includes("--all")) return Infinity;

  const raw = process.argv.find((a) => a.startsWith("--limit="));
  if (raw) {
    const n = Number(raw.slice("--limit=".length));
    if (!Number.isFinite(n)) return DEFAULT_COUNTRY_LIMIT;
    if (n <= 0) return Infinity;
    return Math.floor(n);
  }

  return DEFAULT_COUNTRY_LIMIT;
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
  if (process.argv.includes("--reset-only")) {
    clearProgressFile();
    console.log("Removed .marinas-osm-import-state.json — next `npm run marinas:import:osm` starts from the first country.");
    return;
  }

  if (process.argv.includes("--reset-progress")) {
    clearProgressFile();
    console.log("Cleared .marinas-osm-import-state.json — will start from the first country of the default list.");
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const full = parseCountriesArg();
  const defaultList = usingDefaultCountryList();
  const { offset: offsetParsed, explicit: explicitOffset } = parseOffsetArg();
  let offset = resolveOffset(explicitOffset, offsetParsed, defaultList);
  offset = Math.min(offset, full.length);
  const countryLimit = parseCountryLimit();
  const end = countryLimit === Infinity ? undefined : offset + countryLimit;
  const isos = full.slice(offset, end);

  if (isos.length === 0) {
    console.log("No countries in this window — list may be done. Use --reset-progress to restart, or check --offset.");
    if (defaultList && !DRY) clearProgressFile();
    return;
  }

  const persist =
    defaultList && !DRY && countryLimit !== Infinity && !explicitOffset && !process.argv.includes("--all");

  console.log(
    `OSM marina import — this run: ${isos.length} countr${isos.length === 1 ? "y" : "ies"} (offset ${offset}, full list ${full.length})${DRY ? " (dry run)" : ""}`,
  );
  if (defaultList && !DRY) {
    console.log(`Countries this run: ${isos.join(", ")} (${isos.map((c) => ISO_TO_NAME[c] ?? c).join("; ")})`);
  }
  if (!persist && countryLimit !== Infinity && offset + isos.length < full.length) {
    console.log(`Next batch: --offset=${offset + isos.length} or increase --limit`);
  }

  if (!DRY && (!url || !key)) {
    const missing: string[] = [];
    if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    console.error(
      `Missing or empty in .env.local: ${missing.join(", ")}. Copy from .env.example — use the service role key (Settings → API), not the anon key.`,
    );
    console.error("Overpass-only check: npx tsx scripts/import-marinas-osm.ts --countries=GB --dry-run");
    process.exit(1);
  }

  const sb = DRY ? null : createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let total = 0;
  /** Furthest index into `full` completed successfully (exclusive), within this run's window. */
  let progressEndExclusive = offset;
  const skippedIsos: string[] = [];

  for (let idx = 0; idx < isos.length; idx++) {
    const iso = isos[idx];
    const q = overpassQuery(iso);
    console.log(`[${iso}] Overpass request (can take 1–3 min for large areas)…`);
    const fetched = await fetchOverpassElements(iso, q);
    if (!fetched.ok) {
      console.error(`[error] ${iso}: ${fetched.detail} — skipping (others continue). Backfill: --countries=${iso}`);
      skippedIsos.push(iso);
      continue;
    }
    const elements = fetched.elements;

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

    if (DRY || !sb) {
      progressEndExclusive = offset + idx + 1;
    } else {
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const { error } = await sb.from("marinas").upsert(chunk, { onConflict: "id" });
        if (error) {
          console.error(`[error] ${iso} upsert:`, error.message);
          process.exit(1);
        }
      }
      progressEndExclusive = offset + idx + 1;
    }

    await sleep(DELAY_MS);
  }

  if (persist && progressEndExclusive > offset) {
    saveProgressOffset(progressEndExclusive, full.length);
    if (progressEndExclusive < full.length) {
      console.log(
        `Saved progress (${progressEndExclusive}/${full.length}). Run again: npm run marinas:import:osm — next country loads automatically.`,
      );
    } else {
      console.log(`Default list finished (${full.length} countries). Clearing progress file.`);
      clearProgressFile();
    }
  }

  if (skippedIsos.length > 0) {
    console.warn(
      `[warn] Skipped ${skippedIsos.length} countr${skippedIsos.length === 1 ? "y" : "ies"}: ${skippedIsos.join(", ")} — run again with:\n  npx tsx scripts/import-marinas-osm.ts --countries=${skippedIsos.join(",")}`,
    );
  }
  console.log(DRY ? `Dry run complete — would process up to ${total} rows.` : `Done. Upserted ~${total} marina rows total.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
