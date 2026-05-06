import { NextResponse } from "next/server";

export const runtime = "nodejs";

type StyleId = "colour" | "bw";

type CacheEntry = {
  storedAtMs: number;
  contentType: string;
  bytes: ArrayBuffer;
  upstreamImageUrl: string;
};

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

const LEADS = Array.from({ length: 8 }, (_, i) => i * 12); // 0..84 inclusive (12h steps)

function clean(s: string | null): string {
  return (s ?? "").trim();
}

function parseStyle(s: string | null): StyleId | null {
  const v = clean(s).toLowerCase();
  return v === "colour" || v === "bw" ? (v as StyleId) : null;
}

function parseLead(s: string | null): number | null {
  const n = Number(clean(s));
  if (!Number.isFinite(n)) return null;
  const v = Math.round(n / 12) * 12;
  if (!LEADS.includes(v)) return null;
  return v;
}

async function fetchChartUrlMap(style: StyleId, signal?: AbortSignal): Promise<Map<number, string>> {
  const pageUrl = "https://www.metoffice.gov.uk/weather/maps-and-charts/surface-pressure";
  const res = await fetch(pageUrl, {
    cache: "no-store",
    signal,
    headers: {
      "User-Agent": "SeaLink/1.0 (Met Office chart proxy)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`MetOffice page ${res.status}`);
  const html = await res.text();

  const re =
    style === "colour"
      ? /https:\/\/data\.consumer-digital\.api\.metoffice\.gov\.uk\/v1\/surface-pressure\/colour\/[^\"'<>\\s]+\/FSXX00T_(\\d{2})\\.gif/gi
      : /https:\/\/data\.consumer-digital\.api\.metoffice\.gov\.uk\/v1\/surface-pressure\/bw\/[^\"'<>\\s]+\/[^\\s\"'<>]*FC(\\d{3})\\.gif/gi;

  const out = new Map<number, string>();
  for (const m of html.matchAll(re)) {
    const leadRaw = m[1];
    const url = m[0];
    if (!leadRaw || !url) continue;
    const lead = style === "colour" ? Number(leadRaw) : Number(leadRaw);
    if (!Number.isFinite(lead)) continue;
    // Normalise FC000 -> 0, FC012 -> 12 etc
    const leadH = style === "colour" ? lead : Math.round(lead / 1);
    if (LEADS.includes(leadH)) out.set(leadH, url);
  }

  return out;
}

async function fetchBytes(url: string, signal?: AbortSignal): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(url, {
    cache: "no-store",
    signal,
    headers: {
      "User-Agent": "SeaLink/1.0 (Met Office chart proxy)",
      Accept: "image/*,*/*",
      Referer: "https://www.metoffice.gov.uk/weather/maps-and-charts/surface-pressure",
    },
  });
  if (!res.ok) throw new Error(`MetOffice image ${res.status}`);
  const ct = res.headers.get("content-type") || "application/octet-stream";
  const bytes = await res.arrayBuffer();
  return { bytes, contentType: ct };
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const style = parseStyle(url.searchParams.get("style")) ?? "colour";
  const lead = parseLead(url.searchParams.get("lead")) ?? 0;

  const key = `${style}:${lead}`;
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
    const map = await fetchChartUrlMap(style, req.signal);
    const upstreamImageUrl = map.get(lead);
    if (!upstreamImageUrl) throw new Error("Chart not found for this lead time");
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

