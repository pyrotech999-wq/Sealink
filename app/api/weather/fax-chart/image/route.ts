import { NextResponse } from "next/server";
import { getRegion, type FaxChartTypeId, type FaxRegionId, type FaxSourceId } from "@/lib/weather/fax-charts";
import { getOpcFamily, getOpcRegion } from "@/lib/weather/opc-products";
import type { OpcTimelineKey } from "@/lib/weather/opc-products";

export const runtime = "nodejs";

type CacheEntry = {
  storedAtMs: number;
  contentType: string;
  bytes: ArrayBuffer;
  upstreamImageUrl: string;
  issueTime: string;
  validTime: string;
};

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

function clean(s: string | null): string {
  return (s ?? "").trim();
}

function isSafeId(s: string): boolean {
  return /^[a-z0-9_]+$/i.test(s);
}

function parseSource(s: string | null): FaxSourceId | null {
  const v = clean(s).toLowerCase();
  return v === "dwd" || v === "opc" ? (v as FaxSourceId) : null;
}

function parseRegion(s: string | null): FaxRegionId | null {
  const v = clean(s);
  if (!v || !isSafeId(v)) return null;
  return v as FaxRegionId;
}

function parseChartType(s: string | null): FaxChartTypeId | null {
  const v = clean(s);
  if (!v || !isSafeId(v)) return null;
  return v as FaxChartTypeId;
}

function parseHour(s: string | null): number {
  const n = Number(clean(s) || "0");
  if (!Number.isFinite(n)) return 0;
  const allowed = [0, 24, 48, 72, 96];
  const v = Math.round(n / 24) * 24;
  return allowed.includes(v) ? v : 0;
}

function addHoursIso(issueIso: string, hours: number): string {
  const t = new Date(issueIso);
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return issueIso;
  return new Date(ms + hours * 60 * 60 * 1000).toISOString();
}

async function fetchBytes(url: string, signal?: AbortSignal): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(url, {
    cache: "no-store",
    signal,
    headers: {
      "User-Agent": "SeaLink/1.0 (fax chart proxy)",
      Accept: "image/*,*/*",
    },
  });
  if (!res.ok) throw new Error(`Upstream image ${res.status}`);
  const ct = res.headers.get("content-type") || "application/octet-stream";
  const bytes = await res.arrayBuffer();
  return { bytes, contentType: ct };
}

async function opcImageUrl(opts: {
  regionId: FaxRegionId;
  chartType: FaxChartTypeId;
  hour: number;
  issueStamp: string;
}): Promise<{ url: string; issueIso: string; validIso: string }> {
  const opcRegion =
    opts.regionId === "opc_pacific" ? getOpcRegion("pacific") : opts.regionId === "opc_arctic" ? getOpcRegion("arctic") : getOpcRegion("atlantic");

  const famId =
    opts.chartType === "surface_pressure"
      ? "surface"
      : opts.chartType === "wind_wave" || opts.chartType === "sea_state" || opts.chartType === "wave_height_direction"
        ? "wind_wave"
        : "surface";

  const fam = getOpcFamily(opcRegion, famId);
  const timelineKey: OpcTimelineKey = opts.hour === 0 ? "analysis" : (String(opts.hour) + "h") as OpcTimelineKey;
  const product = fam.productsByTimeline[timelineKey as OpcTimelineKey];
  if (!product) throw new Error("Unavailable forecast hour");

  const issueStamp = opts.issueStamp;
  if (!/^\d{10}$/.test(issueStamp)) throw new Error("Invalid issueTime");

  const issueIso = new Date(
    Date.UTC(
      Number(issueStamp.slice(0, 4)),
      Number(issueStamp.slice(4, 6)) - 1,
      Number(issueStamp.slice(6, 8)),
      Number(issueStamp.slice(8, 10)),
      0,
      0,
    ),
  ).toISOString();
  const validIso = addHoursIso(issueIso, opts.hour);

  const url = `https://ocean.weather.gov/Loops/${product}/image_${issueStamp}.gif`;
  return { url, issueIso, validIso };
}

async function dwdImageUrl(opts: { regionId: FaxRegionId; hour: number; issueStamp: string }): Promise<{ url: string; issueIso: string; validIso: string }> {
  const dwdRegionKey =
    opts.regionId === "dwd_baltic_sea"
      ? "ostsa"
      : opts.regionId === "dwd_east_atlantic"
        ? "oantik"
        : opts.regionId === "dwd_med_west"
          ? "wmitme"
          : opts.regionId === "dwd_med_east"
            ? "omitme"
            : "nordsa";

  const hh = String(Math.max(0, Math.min(72, Math.round(opts.hour / 24) * 24))).padStart(2, "0");
  const url = `https://www.dwd.de/DWD/wetter/wv_spez/seewetter/${dwdRegionKey}_${hh}.png`;

  // issueStamp is resolver-provided; convert to ISO for display/headers.
  const s = opts.issueStamp;
  if (!/^\d{10}$/.test(s)) throw new Error("Invalid issueTime");
  const issueIso = new Date(
    Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)), Number(s.slice(8, 10)), 0, 0),
  ).toISOString();
  const validIso = addHoursIso(issueIso, opts.hour);
  return { url, issueIso, validIso };
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const source = parseSource(url.searchParams.get("source")) ?? "opc";
  const regionId = parseRegion(url.searchParams.get("region")) ?? ("opc_atlantic" as FaxRegionId);
  const chartType = parseChartType(url.searchParams.get("chartType")) ?? ("surface_pressure" as FaxChartTypeId);
  const hour = parseHour(url.searchParams.get("forecastHour"));
  const issueStamp = clean(url.searchParams.get("issueTime"));

  let region: { id: FaxRegionId; label: string; source: FaxSourceId };
  try {
    region = getRegion(regionId);
  } catch {
    return NextResponse.json({ error: "Invalid region" }, { status: 400 });
  }
  if (region.source !== source) {
    return NextResponse.json({ error: "Region/source mismatch" }, { status: 400 });
  }

  const key = `src=${source}|reg=${regionId}|type=${chartType}|h=${hour}|iss=${issueStamp}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.storedAtMs < TTL_MS) {
    return new NextResponse(hit.bytes, {
      status: 200,
      headers: {
        "Content-Type": hit.contentType,
        "Cache-Control": "public, max-age=21600, s-maxage=21600",
        "X-Sealink-Chart-Cache": "HIT",
        "X-Sealink-Issue-Time": hit.issueTime,
        "X-Sealink-Valid-Time": hit.validTime,
        "X-Sealink-Upstream": hit.upstreamImageUrl,
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
        "X-Sealink-Issue-Time": e.issueTime,
        "X-Sealink-Valid-Time": e.validTime,
        "X-Sealink-Upstream": e.upstreamImageUrl,
      },
    });
  }

  const p = (async () => {
    const meta =
      source === "opc"
        ? await opcImageUrl({ regionId, chartType, hour, issueStamp })
        : await dwdImageUrl({ regionId, hour, issueStamp });
    const { bytes, contentType } = await fetchBytes(meta.url, req.signal);
    const entry: CacheEntry = {
      storedAtMs: Date.now(),
      bytes,
      contentType,
      upstreamImageUrl: meta.url,
      issueTime: meta.issueIso,
      validTime: meta.validIso,
    };
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
        "X-Sealink-Issue-Time": e.issueTime,
        "X-Sealink-Valid-Time": e.validTime,
        "X-Sealink-Upstream": e.upstreamImageUrl,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upstream unavailable";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

