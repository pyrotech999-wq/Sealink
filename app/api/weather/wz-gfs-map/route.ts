import { NextResponse } from "next/server";
import {
  buildWzGfsMapPngPath,
  isValidGfsRunHour,
  type WzGfsMapParam,
  type WzGfsMapRegionCode,
  WZ_GFS_MAP_MAX_H_3D,
  WZ_GFS_MAP_REGIONS,
  WZ_GFS_MAP_STEP_H,
  wzGfsMapVarId,
} from "@/lib/wetterzentrale-gfs-map-image";

export const runtime = "nodejs";

const WZ_ORIGIN = "https://www.wetterzentrale.de";
const CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 400;

type CacheEntry = { body: Buffer; storedAt: number };

const memoryCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Buffer>>();

const ALLOWED_REGIONS = new Set<WzGfsMapRegionCode>(WZ_GFS_MAP_REGIONS.map((r) => r.code));

function cacheKey(region: WzGfsMapRegionCode, run: number, leadHours: number, param: WzGfsMapParam): string {
  return `${region}|${run}|${leadHours}|${param}`;
}

function pruneCache(): void {
  if (memoryCache.size <= MAX_CACHE_ENTRIES) return;
  const entries = [...memoryCache.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
  const drop = entries.slice(0, Math.ceil(entries.length * 0.25));
  for (const [k] of drop) memoryCache.delete(k);
}

async function fetchPng(path: string): Promise<Uint8Array> {
  const url = `${WZ_ORIGIN}/maps/${path}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "SeaLinkWeatherMap/1.0 (+https://sealink)",
      Accept: "image/png,*/*",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`WZ maps HTTP ${res.status}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 200) {
    throw new Error("WZ maps empty or too small");
  }
  return buf;
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const region = (searchParams.get("region") ?? "").toUpperCase() as WzGfsMapRegionCode;
  const runRaw = Number(searchParams.get("run"));
  const leadRaw = Number(searchParams.get("time") ?? searchParams.get("lead"));
  const param = (searchParams.get("param") ?? "") as WzGfsMapParam;

  if (!ALLOWED_REGIONS.has(region)) {
    return NextResponse.json({ error: "Invalid region" }, { status: 400 });
  }
  if (!isValidGfsRunHour(runRaw)) {
    return NextResponse.json({ error: "Invalid run (use 0, 6, 12, or 18 UTC)" }, { status: 400 });
  }
  if (
    !Number.isFinite(leadRaw) ||
    !Number.isInteger(leadRaw) ||
    leadRaw < 0 ||
    leadRaw > WZ_GFS_MAP_MAX_H_3D ||
    leadRaw % WZ_GFS_MAP_STEP_H !== 0
  ) {
    return NextResponse.json(
      { error: `Lead time must be an integer multiple of ${WZ_GFS_MAP_STEP_H} from 0 to ${WZ_GFS_MAP_MAX_H_3D} (hours).` },
      { status: 400 },
    );
  }
  const leadHours = leadRaw;
  if (param !== "wind10m" && param !== "temp2m" && param !== "precip1h") {
    return NextResponse.json({ error: "Invalid param" }, { status: 400 });
  }

  const meta = WZ_GFS_MAP_REGIONS.find((r) => r.code === region);
  if (param === "wind10m" && meta && !meta.supports10mWind) {
    return NextResponse.json(
      { error: "10 m wind maps are not published for this region on Wetterzentrale GFS OP." },
      { status: 404 },
    );
  }

  const varId = wzGfsMapVarId(param);
  const path = buildWzGfsMapPngPath({ region, run: runRaw, leadHours, param });
  const key = cacheKey(region, runRaw, leadHours, param);

  const now = Date.now();
  const hit = memoryCache.get(key);
  if (hit && now - hit.storedAt < CACHE_MS) {
    return new NextResponse(hit.body, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=21600, s-maxage=21600",
        "X-Sealink-Map-Cache": "HIT",
        "X-WZ-Map-Path": path,
        "X-WZ-Map-Var": String(varId),
      },
    });
  }

  let body: Uint8Array;
  try {
    const existing = inflight.get(key);
    if (existing) {
      body = await existing;
    } else {
      const p = fetchPng(path).finally(() => inflight.delete(key));
      inflight.set(key, p);
      body = await p;
    }
  } catch {
    return NextResponse.json({ error: "Upstream map unavailable" }, { status: 502 });
  }

  memoryCache.set(key, { body, storedAt: now });
  pruneCache();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=21600, s-maxage=21600",
      "X-Sealink-Map-Cache": "MISS",
      "X-WZ-Map-Path": path,
      "X-WZ-Map-Var": String(varId),
    },
  });
}
