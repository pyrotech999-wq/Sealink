import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { canUseKv, kvGetJson, kvSetJson } from "@/lib/kv-json";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DATA_PATH = path.join(process.cwd(), "data", "site-banner-ads.json");
const KV_KEY = "sealink:site-banner-ads:v1";

export const SITE_BANNER_ADS_MAX = 10;

export type SiteBannerAdRecord = {
  id: string;
  imageUrl: string;
  linkUrl: string;
  altText: string;
  sortOrder: number;
  enabled: boolean;
  updatedAt: string;
};

type FileShape = { items: SiteBannerAdRecord[] };

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function readFileShape(): FileShape {
  try {
    if (!existsSync(DATA_PATH)) return { items: [] };
    const raw = readFileSync(DATA_PATH, "utf-8");
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return { items: [] };
    const o = p as Partial<FileShape>;
    return { items: Array.isArray(o.items) ? o.items : [] };
  } catch {
    return { items: [] };
  }
}

function writeFileShape(s: FileShape): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(s, null, 2), "utf-8");
}

async function readAllFromKvOrFile(): Promise<SiteBannerAdRecord[]> {
  if (canUseKv()) {
    const raw = await kvGetJson<FileShape | null>(KV_KEY, null);
    if (raw && typeof raw === "object" && Array.isArray(raw.items)) return raw.items;
    return [];
  }
  return readFileShape().items;
}

async function writeAllToKvOrFile(items: SiteBannerAdRecord[]): Promise<void> {
  const shape: FileShape = { items };
  if (canUseKv()) await kvSetJson(KV_KEY, shape);
  else writeFileShape(shape);
}

function normaliseRecord(row: {
  id: string;
  imageUrl: string;
  linkUrl: string;
  altText: string;
  sortOrder: number;
  enabled: boolean;
  updatedAt: string;
}): SiteBannerAdRecord {
  return {
    id: row.id,
    imageUrl: row.imageUrl.trim(),
    linkUrl: row.linkUrl.trim(),
    altText: row.altText.trim(),
    sortOrder: row.sortOrder,
    enabled: row.enabled,
    updatedAt: row.updatedAt,
  };
}

async function listPublicFromFileOrKv(): Promise<SiteBannerAdRecord[]> {
  const items = await readAllFromKvOrFile();
  return items
    .filter((x) => x.enabled && x.imageUrl && x.linkUrl)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .slice(0, SITE_BANNER_ADS_MAX);
}

/** Public: enabled only, sorted, capped. */
export async function listPublicSiteBannerAds(): Promise<SiteBannerAdRecord[]> {
  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      try {
        const sb = supabaseAdmin();
        const { data, error } = await sb
          .from("site_banner_ads")
          .select("id, image_url, link_url, alt_text, sort_order, enabled, updated_at")
          .eq("enabled", true)
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true })
          .limit(SITE_BANNER_ADS_MAX);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as {
          id: string;
          image_url: string;
          link_url: string;
          alt_text: string;
          sort_order: number;
          enabled: boolean;
          updated_at: string;
        }[];
        return rows.map((r) =>
          normaliseRecord({
            id: r.id,
            imageUrl: r.image_url,
            linkUrl: r.link_url,
            altText: typeof r.alt_text === "string" ? r.alt_text : "",
            sortOrder: r.sort_order,
            enabled: r.enabled,
            updatedAt: r.updated_at,
          }),
        );
      } catch {
        // Table missing (migration not applied) or transient DB error — use file/KV if any.
        return listPublicFromFileOrKv();
      }
    }

    return listPublicFromFileOrKv();
  });
}

/** Admin: all rows. */
export async function adminListSiteBannerAds(): Promise<SiteBannerAdRecord[]> {
  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("site_banner_ads")
        .select("id, image_url, link_url, alt_text, sort_order, enabled, updated_at")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .limit(SITE_BANNER_ADS_MAX);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as {
        id: string;
        image_url: string;
        link_url: string;
        alt_text: string;
        sort_order: number;
        enabled: boolean;
        updated_at: string;
      }[];
      return rows.map((r) =>
        normaliseRecord({
          id: r.id,
          imageUrl: r.image_url,
          linkUrl: r.link_url,
          altText: typeof r.alt_text === "string" ? r.alt_text : "",
          sortOrder: r.sort_order,
          enabled: r.enabled,
          updatedAt: r.updated_at,
        }),
      );
    }

    return (await readAllFromKvOrFile())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .slice(0, SITE_BANNER_ADS_MAX);
  });
}

function isHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

export type AdminSaveBannerInput = {
  id?: string;
  imageUrl: string;
  linkUrl: string;
  altText?: string;
  sortOrder?: number;
  enabled?: boolean;
}[];

/** Add, update, or remove rows (omit from payload to delete). Max {@link SITE_BANNER_ADS_MAX} rows. */
export async function adminSaveSiteBannerAds(
  input: AdminSaveBannerInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Array.isArray(input) || input.length > SITE_BANNER_ADS_MAX) {
    return { ok: false, error: `Provide at most ${SITE_BANNER_ADS_MAX} adverts.` };
  }

  const now = new Date().toISOString();
  const cleaned: SiteBannerAdRecord[] = [];

  for (let i = 0; i < input.length; i++) {
    const row = input[i];
    if (!row || typeof row !== "object") continue;
    const imageUrl = typeof row.imageUrl === "string" ? row.imageUrl.trim() : "";
    const linkUrl = typeof row.linkUrl === "string" ? row.linkUrl.trim() : "";
    if (!imageUrl && !linkUrl) continue;
    if (!imageUrl || !linkUrl) {
      return { ok: false, error: "Each advert needs both image URL and link URL." };
    }
    if (!isHttpsUrl(imageUrl) || !isHttpsUrl(linkUrl)) {
      return { ok: false, error: "Image and link must be valid http(s) URLs." };
    }
    const altText = typeof row.altText === "string" ? row.altText.trim().slice(0, 200) : "";
    const sortOrder = typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder) ? Math.floor(row.sortOrder) : i;
    const enabled = row.enabled !== false;
    const rawId = typeof row.id === "string" ? row.id.trim() : "";
    const id = rawId && isUuid(rawId) ? rawId : randomUUID();
    cleaned.push({
      id,
      imageUrl,
      linkUrl,
      altText,
      sortOrder,
      enabled,
      updatedAt: now,
    });
  }

  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const incomingIds = cleaned.map((c) => c.id);
      const { data: existingRows, error: exErr } = await sb.from("site_banner_ads").select("id");
      if (exErr) return { ok: false, error: exErr.message };
      const existingIds = new Set(
        (existingRows ?? []).map((r) => (r as { id: string }).id).filter((x) => typeof x === "string"),
      );
      const toRemove = [...existingIds].filter((id) => !incomingIds.includes(id));
      if (toRemove.length > 0) {
        const { error: delErr } = await sb.from("site_banner_ads").delete().in("id", toRemove);
        if (delErr) return { ok: false, error: delErr.message };
      }
      if (cleaned.length > 0) {
        const { error: upErr } = await sb.from("site_banner_ads").upsert(
          cleaned.map((c) => ({
            id: c.id,
            image_url: c.imageUrl,
            link_url: c.linkUrl,
            alt_text: c.altText,
            sort_order: c.sortOrder,
            enabled: c.enabled,
            updated_at: c.updatedAt,
          })),
          { onConflict: "id" },
        );
        if (upErr) return { ok: false, error: upErr.message };
      }
      return { ok: true };
    }

    await writeAllToKvOrFile(cleaned);
    return { ok: true };
  });
}
