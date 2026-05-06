import { NextResponse } from "next/server";
import { listAllOpcProducts } from "@/lib/weather/opc-products";

export const runtime = "nodejs";

type CacheEntry = {
  storedAtMs: number;
  contentType: string;
  bytes: ArrayBuffer;
  upstreamImageUrl: string;
};

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

const ALLOWED_PRODUCTS = listAllOpcProducts();
const ALLOWED_CATEGORIES = new Set(["atlantic", "pacific", "arctic"]);

function clean(s: string | null): string {
  return (s ?? "").trim();
}

function isSafeProductId(s: string): boolean {
  return /^[a-z0-9_]+$/i.test(s);
}

async function fetchLatestImageUrl(category: string, product: string, signal?: AbortSignal): Promise<string> {
  const loopsUrl = new URL("https://ocean.weather.gov/Loops/index.php");
  loopsUrl.searchParams.set("category", category);
  loopsUrl.searchParams.set("product", product);
  loopsUrl.searchParams.set("days", "1");
  loopsUrl.searchParams.set("loop", "0");

  const htmlRes = await fetch(loopsUrl.toString(), {
    cache: "no-store",
    signal,
    headers: {
      "User-Agent": "SeaLink/1.0 (OPC chart proxy)",
    },
  });
  if (!htmlRes.ok) throw new Error(`OPC loops HTML ${htmlRes.status}`);
  const html = await htmlRes.text();

  // The page contains relative src like: atlsfcf24/image_2026050600.gif
  const re = new RegExp(`\\b${product}/image_\\d{10}\\.(gif|png|jpg)\\b`, "i");
  const m = html.match(re);
  if (!m?.[0]) throw new Error("No chart image found");

  return `https://ocean.weather.gov/Loops/${m[0]}`;
}

async function fetchBytes(url: string, signal?: AbortSignal): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(url, {
    cache: "no-store",
    signal,
    headers: {
      "User-Agent": "SeaLink/1.0 (OPC chart proxy)",
    },
  });
  if (!res.ok) throw new Error(`OPC image ${res.status}`);
  const ct = res.headers.get("content-type") || "application/octet-stream";
  const bytes = await res.arrayBuffer();
  return { bytes, contentType: ct };
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const category = clean(url.searchParams.get("category"));
  const product = clean(url.searchParams.get("product"));

  if (!category || !ALLOWED_CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (!product || !isSafeProductId(product) || !ALLOWED_PRODUCTS.has(product)) {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }

  const key = `${category}:${product}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.storedAtMs < TTL_MS) {
    return new NextResponse(hit.bytes, {
      status: 200,
      headers: {
        "Content-Type": hit.contentType,
        "Cache-Control": "public, max-age=21600, s-maxage=21600",
        "X-Sealink-Chart-Cache": "HIT",
        "X-Sealink-Chart-Upstream": hit.upstreamImageUrl,
      },
    });
  }

  const existing = inflight.get(key);
  if (existing) {
    const e = await existing;
    return new NextResponse(e.bytes, {
      status: 200,
      headers: {
        "Content-Type": e.contentType,
        "Cache-Control": "public, max-age=21600, s-maxage=21600",
        "X-Sealink-Chart-Cache": "HIT-INFLIGHT",
        "X-Sealink-Chart-Upstream": e.upstreamImageUrl,
      },
    });
  }

  const p = (async () => {
    const upstreamImageUrl = await fetchLatestImageUrl(category, product, req.signal);
    const { bytes, contentType } = await fetchBytes(upstreamImageUrl, req.signal);
    const entry: CacheEntry = { storedAtMs: Date.now(), bytes, contentType, upstreamImageUrl };
    cache.set(key, entry);
    return entry;
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);

  try {
    const e = await p;
    return new NextResponse(e.bytes, {
      status: 200,
      headers: {
        "Content-Type": e.contentType,
        // Cache in browsers/CDNs; our own memory cache also holds for 6h.
        "Cache-Control": "public, max-age=600, s-maxage=21600",
        "X-Sealink-Chart-Cache": "MISS",
        "X-Sealink-Chart-Upstream": e.upstreamImageUrl,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upstream unavailable";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

