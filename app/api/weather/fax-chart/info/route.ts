import { NextResponse } from "next/server";
import { getRegion, type FaxChartTypeId, type FaxRegionId, type FaxSourceId } from "@/lib/weather/fax-charts";
import { getOpcFamily, getOpcRegion } from "@/lib/weather/opc-products";
import type { OpcTimelineKey } from "@/lib/weather/opc-products";

export const runtime = "nodejs";

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
  const v = Math.max(0, Math.round(n / 24) * 24);
  return v === 0 ? 0 : v;
}

function fmtIssueStamp(d: Date): string {
  // YYYYMMDDHH
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}`;
}

async function opcLatestIssueStamp(opts: { category: string; product: string; signal?: AbortSignal }): Promise<string> {
  const loopsUrl = new URL("https://ocean.weather.gov/Loops/index.php");
  loopsUrl.searchParams.set("category", opts.category);
  loopsUrl.searchParams.set("product", opts.product);
  loopsUrl.searchParams.set("days", "1");
  loopsUrl.searchParams.set("loop", "0");

  const htmlRes = await fetch(loopsUrl.toString(), {
    cache: "no-store",
    signal: opts.signal,
    headers: { "User-Agent": "SeaLink/1.0 (fax chart resolver)" },
  });
  if (!htmlRes.ok) throw new Error(`OPC loops HTML ${htmlRes.status}`);
  const html = await htmlRes.text();
  const re = new RegExp(`\\b${opts.product}/image_(\\d{10})\\.(gif|png|jpg)\\b`, "i");
  const m = html.match(re);
  if (!m?.[1]) throw new Error("No OPC chart stamp found");
  return m[1];
}

async function dwdIssueTimeIso(opts: { path: string; signal?: AbortSignal }): Promise<string> {
  const url = `https://www.dwd.de${opts.path}`;
  const res = await fetch(url, { method: "HEAD", cache: "no-store", signal: opts.signal });
  if (!res.ok) throw new Error(`DWD HEAD ${res.status}`);
  const lm = res.headers.get("last-modified");
  const t = lm ? new Date(lm) : new Date();
  if (!Number.isFinite(t.getTime())) return new Date().toISOString();
  return t.toISOString();
}

function addHoursIso(issueIso: string, hours: number): string {
  const t = new Date(issueIso);
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return issueIso;
  return new Date(ms + hours * 60 * 60 * 1000).toISOString();
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const source = parseSource(url.searchParams.get("source")) ?? "opc";
  const regionId = parseRegion(url.searchParams.get("region")) ?? ("opc_atlantic" as FaxRegionId);
  const chartType = parseChartType(url.searchParams.get("chartType")) ?? ("surface_pressure" as FaxChartTypeId);
  const hour = parseHour(url.searchParams.get("forecastHour"));

  let region: { id: FaxRegionId; label: string; source: FaxSourceId };
  try {
    region = getRegion(regionId);
  } catch {
    return NextResponse.json({ error: "Invalid region" }, { status: 400 });
  }
  if (region.source !== source) {
    return NextResponse.json({ error: "Region/source mismatch" }, { status: 400 });
  }

  try {
    if (source === "opc") {
      const opcRegion =
        regionId === "opc_pacific" ? getOpcRegion("pacific") : regionId === "opc_arctic" ? getOpcRegion("arctic") : getOpcRegion("atlantic");

      // Map fax chart type -> OPC product family
      const famId =
        chartType === "surface_pressure" ? "surface" : chartType === "wind_wave" || chartType === "sea_state" || chartType === "wave_height_direction" ? "wind_wave" : "surface";
      const fam = getOpcFamily(opcRegion, famId);

      const timelineKey: OpcTimelineKey = hour === 0 ? "analysis" : (String(hour) + "h") as OpcTimelineKey;
      const product = fam.productsByTimeline[timelineKey as OpcTimelineKey];
      if (!product) {
        return NextResponse.json({ ok: false, error: "Unavailable forecast hour for this chart type" }, { status: 400 });
      }

      const issueStamp = await opcLatestIssueStamp({ category: opcRegion.opcCategory, product, signal: req.signal });
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

      const validIso = addHoursIso(issueIso, hour);

      const imageUrl = new URL("https://ocean.weather.gov/Loops/index.php");
      imageUrl.searchParams.set("category", opcRegion.opcCategory);
      imageUrl.searchParams.set("product", product);

      const imgPath = `/api/weather/fax-chart/image?source=opc&region=${regionId}&chartType=${chartType}&forecastHour=${hour}&issueTime=${issueStamp}`;
      return NextResponse.json({
        ok: true,
        source,
        region: regionId,
        chartType,
        forecastHour: hour,
        issueTime: issueIso,
        validTime: validIso,
        issueStamp,
        product,
        upstream: imageUrl.toString(),
        imagePath: imgPath,
      });
    }

    // DWD
    const dwdRegionKey =
      regionId === "dwd_baltic_sea"
        ? "ostsa"
        : regionId === "dwd_east_atlantic"
          ? "oantik"
          : regionId === "dwd_med_west"
            ? "wmitme"
            : regionId === "dwd_med_east"
              ? "omitme"
              : "nordsa";

    const hh = String(Math.max(0, Math.min(72, Math.round(hour / 24) * 24))).padStart(2, "0");
    const path = `/DWD/wetter/wv_spez/seewetter/${dwdRegionKey}_${hh}.png`;

    const issueIso = await dwdIssueTimeIso({ path, signal: req.signal });
    const validIso = addHoursIso(issueIso, hour);
    const issueStamp = fmtIssueStamp(new Date(issueIso));

    const imgPath = `/api/weather/fax-chart/image?source=dwd&region=${regionId}&chartType=${chartType}&forecastHour=${hour}&issueTime=${encodeURIComponent(
      issueStamp,
    )}`;
    return NextResponse.json({
      ok: true,
      source,
      region: regionId,
      chartType,
      forecastHour: hour,
      issueTime: issueIso,
      validTime: validIso,
      issueStamp,
      upstream: `https://www.dwd.de${path}`,
      imagePath: imgPath,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Resolver failed" }, { status: 502 });
  }
}

