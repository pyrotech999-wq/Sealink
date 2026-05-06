import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TTL_MS = 6 * 60 * 60 * 1000;

type CacheEntry = {
  createdAt: number;
  bytes: ArrayBuffer;
  contentType: string;
  upstream: string;
};

const cache = new Map<string, CacheEntry>();

function getUpstreamForHour(hour: string): { ok: true; upstream: string } | { ok: false; error: string } {
  const h = hour.trim().toLowerCase();
  if (h === "analysis") return { ok: true, upstream: "https://www.weathercharts.net/ukmo_mslp_analysis/ppva.gif" };
  if (h === "24") return { ok: true, upstream: "https://www.weathercharts.net/ukmo_mslp_prognosis/ppve.gif" };
  if (h === "36") return { ok: true, upstream: "https://www.weathercharts.net/ukmo_mslp_prognosis/ppvg.gif" };
  if (h === "48") return { ok: true, upstream: "https://www.weathercharts.net/ukmo_mslp_prognosis/ppvi.gif" };
  if (h === "60") return { ok: true, upstream: "https://www.weathercharts.net/ukmo_mslp_prognosis/ppvj.gif" };
  if (h === "72") return { ok: true, upstream: "https://www.weathercharts.net/ukmo_mslp_prognosis/ppvk.gif" };
  if (h === "84") return { ok: true, upstream: "https://www.weathercharts.net/ukmo_mslp_prognosis/ppvl.gif" };
  if (h === "96") return { ok: true, upstream: "https://www.weathercharts.net/ukmo_mslp_prognosis/ppvm.gif" };
  if (h === "120") return { ok: true, upstream: "https://www.weathercharts.net/ukmo_mslp_prognosis/ppvo.gif" };
  return { ok: false, error: "Invalid hour. Use analysis, 24, 36, 48, 60, 72, 84, 96, or 120." };
}

async function fetchBytes(upstream: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(upstream, {
    // We do our own 6h cache; avoid serverless fetch cache surprises.
    cache: "no-store",
    headers: {
      "User-Agent": "SeaLink/1.0 (weather proxy)",
      Accept: "image/gif,image/*;q=0.8,*/*;q=0.5",
    },
  });
  if (!res.ok) throw new Error(`Upstream fetch failed: ${res.status}`);
  const ct = res.headers.get("content-type") ?? "image/gif";
  const bytes = await res.arrayBuffer();
  return { bytes, contentType: ct };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hour = url.searchParams.get("hour") ?? "analysis";
  const resolved = getUpstreamForHour(hour);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });

  const key = `ukmo-mslp:${resolved.upstream}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.createdAt < TTL_MS) {
    return new NextResponse(hit.bytes, {
      headers: {
        "Content-Type": hit.contentType,
        "Cache-Control": "public, max-age=0, must-revalidate",
        "X-SeaLink-Cache": "HIT",
        "X-Upstream-Url": hit.upstream,
      },
    });
  }

  try {
    const { bytes, contentType } = await fetchBytes(resolved.upstream);
    cache.set(key, { createdAt: now, bytes, contentType, upstream: resolved.upstream });
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=0, must-revalidate",
        "X-SeaLink-Cache": "MISS",
        "X-Upstream-Url": resolved.upstream,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upstream error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

