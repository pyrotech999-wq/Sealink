import { NextResponse } from "next/server";
import { buildRegionGrid, getWeatherChartRegion, type WeatherChartRegionId } from "@/lib/weather/model-chart-regions";

export const runtime = "nodejs";

type LayerId = "wind10m" | "pressure_msl" | "precipitation" | "temperature_2m";

const LAYERS: LayerId[] = ["wind10m", "pressure_msl", "precipitation", "temperature_2m"];

const STEP_H = 3;
const MAX_LEAD_H = 117; // ~5 days, 3-hour steps (Open-Meteo returns 120 hourly values)

type OMHourly = {
  time?: string[];
  windspeed_10m?: number[];
  winddirection_10m?: number[];
  pressure_msl?: number[];
  precipitation?: number[];
  temperature_2m?: number[];
};

type OMPoint = {
  latitude: number;
  longitude: number;
  hourly?: OMHourly;
  hourly_units?: Record<string, string>;
};

type GridCacheEntry = {
  storedAtMs: number;
  points: OMPoint[];
  /** Times for index mapping, taken from first location. */
  times: string[];
};

type SvgCacheEntry = { storedAtMs: number; svg: string };

const GRID_TTL_MS = 25 * 60 * 1000;
const SVG_TTL_MS = 6 * 60 * 60 * 1000;

const gridCache = new Map<string, GridCacheEntry>();
const svgCache = new Map<string, SvgCacheEntry>();
const inflightGrid = new Map<string, Promise<GridCacheEntry>>();
const inflightSvg = new Map<string, Promise<string>>();

function clampInt(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function parseRegionId(s: string | null): WeatherChartRegionId | null {
  if (!s) return null;
  return s as WeatherChartRegionId;
}

function parseLayerId(s: string | null): LayerId | null {
  if (!s) return null;
  return (LAYERS as string[]).includes(s) ? (s as LayerId) : null;
}

function gridKey(region: WeatherChartRegionId): string {
  return `region=${region}`;
}

function svgKey(region: WeatherChartRegionId, layer: LayerId, leadHours: number): string {
  return `region=${region}|layer=${layer}|lead=${leadHours}`;
}

function colorScale(value: number, stops: { v: number; c: [number, number, number] }[]): string {
  if (!Number.isFinite(value)) return "rgba(0,0,0,0)";
  const s = [...stops].sort((a, b) => a.v - b.v);
  if (value <= s[0]!.v) return `rgba(${s[0]!.c[0]},${s[0]!.c[1]},${s[0]!.c[2]},0.85)`;
  if (value >= s[s.length - 1]!.v) {
    const last = s[s.length - 1]!;
    return `rgba(${last.c[0]},${last.c[1]},${last.c[2]},0.85)`;
  }
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i]!;
    const b = s[i + 1]!;
    if (value >= a.v && value <= b.v) {
      const t = (value - a.v) / (b.v - a.v || 1);
      const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * t);
      const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * t);
      const bl = Math.round(a.c[2] + (b.c[2] - a.c[2]) * t);
      return `rgba(${r},${g},${bl},0.85)`;
    }
  }
  return "rgba(0,0,0,0)";
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

async function fetchOpenMeteoGrid(region: WeatherChartRegionId, signal?: AbortSignal): Promise<GridCacheEntry> {
  const r = getWeatherChartRegion(region);
  const { points } = buildRegionGrid(r);
  const MAX_POINTS = 420;
  const pts = points.slice(0, MAX_POINTS);

  const url = new URL("https://api.open-meteo.com/v1/gfs");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("forecast_days", "5");
  url.searchParams.set("wind_speed_unit", "kn");
  url.searchParams.set("hourly", "windspeed_10m,winddirection_10m,pressure_msl,precipitation,temperature_2m");
  url.searchParams.set("latitude", pts.map((p) => p.lat.toFixed(4)).join(","));
  url.searchParams.set("longitude", pts.map((p) => p.lon.toFixed(4)).join(","));

  const res = await fetch(url.toString(), { cache: "no-store", signal });
  if (!res.ok) throw new Error(`Open-Meteo gfs ${res.status}`);
  const j = (await res.json()) as OMPoint | OMPoint[];
  const arr = Array.isArray(j) ? j : [j];
  const times = arr[0]?.hourly?.time ?? [];
  return { storedAtMs: Date.now(), points: arr, times };
}

function renderSvg(opts: {
  region: WeatherChartRegionId;
  layer: LayerId;
  leadHours: number;
  grid: GridCacheEntry;
}): string {
  const r = getWeatherChartRegion(opts.region);
  const { latMin, latMax, lonMin, lonMax } = r.bbox;

  const W = 1100;
  const H = 720;
  const pad = 36;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;

  const xOf = (lon: number) => pad + ((lon - lonMin) / (lonMax - lonMin)) * innerW;
  const yOf = (lat: number) => pad + ((latMax - lat) / (latMax - latMin)) * innerH;

  const idx = clampInt(opts.leadHours, 0, (opts.grid.times?.length ?? 0) - 1);
  const stepLabel = `${opts.leadHours}h`;
  const timeLabel = opts.grid.times?.[idx] ? opts.grid.times[idx]! : "";

  // Background + subtle graticule
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#0b1220"/>`,
    `<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="#0f172a" stroke="rgba(255,255,255,.08)"/>`,
  );

  const gridLonStep = Math.max(10, Math.round((lonMax - lonMin) / 6));
  const gridLatStep = Math.max(10, Math.round((latMax - latMin) / 6));
  for (let lon = Math.ceil(lonMin / gridLonStep) * gridLonStep; lon <= lonMax; lon += gridLonStep) {
    const x = xOf(lon);
    parts.push(`<line x1="${x}" y1="${pad}" x2="${x}" y2="${pad + innerH}" stroke="rgba(255,255,255,.05)"/>`);
  }
  for (let lat = Math.ceil(latMin / gridLatStep) * gridLatStep; lat <= latMax; lat += gridLatStep) {
    const y = yOf(lat);
    parts.push(`<line x1="${pad}" y1="${y}" x2="${pad + innerW}" y2="${y}" stroke="rgba(255,255,255,.05)"/>`);
  }

  const title = `GFS · ${r.label} · ${opts.layer}`;
  parts.push(
    `<text x="${pad}" y="${pad - 12}" fill="rgba(255,255,255,.85)" font-size="14" font-family="ui-sans-serif, system-ui" font-weight="600">${escapeXml(
      title,
    )}</text>`,
    `<text x="${pad + innerW}" y="${pad - 12}" text-anchor="end" fill="rgba(255,255,255,.55)" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escapeXml(
      `${stepLabel}  ${timeLabel}`.trim(),
    )}</text>`,
  );

  // Draw field
  const step = r.stepDeg;
  const cellW = (step / (lonMax - lonMin)) * innerW;
  const cellH = (step / (latMax - latMin)) * innerH;

  type Stop = { v: number; c: [number, number, number] };
  const scalarStops: Stop[] =
    opts.layer === "temperature_2m"
      ? [
          { v: -20, c: [70, 120, 255] as [number, number, number] },
          { v: 0, c: [120, 220, 255] as [number, number, number] },
          { v: 10, c: [140, 235, 160] as [number, number, number] },
          { v: 20, c: [255, 220, 120] as [number, number, number] },
          { v: 30, c: [255, 140, 90] as [number, number, number] },
          { v: 40, c: [255, 70, 70] as [number, number, number] },
        ]
      : opts.layer === "precipitation"
        ? [
            { v: 0, c: [20, 20, 30] as [number, number, number] },
            { v: 0.2, c: [80, 140, 255] as [number, number, number] },
            { v: 1, c: [60, 220, 200] as [number, number, number] },
            { v: 3, c: [60, 220, 120] as [number, number, number] },
            { v: 8, c: [255, 220, 90] as [number, number, number] },
            { v: 15, c: [255, 120, 80] as [number, number, number] },
          ]
        : [
            { v: 980, c: [70, 120, 255] as [number, number, number] },
            { v: 1000, c: [120, 220, 255] as [number, number, number] },
            { v: 1015, c: [140, 235, 160] as [number, number, number] },
            { v: 1030, c: [255, 220, 120] as [number, number, number] },
            { v: 1045, c: [255, 140, 90] as [number, number, number] },
          ];

  // scalar underlay for pressure/temp/precip, and also for wind magnitude
  for (const p of opts.grid.points) {
    const lat = p.latitude;
    const lon = p.longitude;
    const x = xOf(lon);
    const y = yOf(lat);
    let v: number | undefined;

    if (opts.layer === "temperature_2m") v = p.hourly?.temperature_2m?.[idx];
    if (opts.layer === "precipitation") v = p.hourly?.precipitation?.[idx];
    if (opts.layer === "pressure_msl") v = p.hourly?.pressure_msl?.[idx];
    if (opts.layer === "wind10m") v = p.hourly?.windspeed_10m?.[idx];

    const fill =
      opts.layer === "wind10m"
        ? colorScale(Number(v ?? NaN), [
            { v: 0, c: [40, 80, 140] as [number, number, number] },
            { v: 10, c: [80, 140, 255] as [number, number, number] },
            { v: 20, c: [80, 220, 200] as [number, number, number] },
            { v: 30, c: [120, 235, 160] as [number, number, number] },
            { v: 40, c: [255, 220, 120] as [number, number, number] },
            { v: 55, c: [255, 120, 80] as [number, number, number] },
          ])
        : colorScale(Number(v ?? NaN), scalarStops);

    parts.push(
      `<rect x="${x - cellW / 2}" y="${y - cellH / 2}" width="${cellW}" height="${cellH}" fill="${fill}" opacity="0.9"/>`,
    );
  }

  if (opts.layer === "wind10m") {
    for (const p of opts.grid.points) {
      const lat = p.latitude;
      const lon = p.longitude;
      const sp = p.hourly?.windspeed_10m?.[idx];
      const dir = p.hourly?.winddirection_10m?.[idx];
      if (!Number.isFinite(sp) || !Number.isFinite(dir)) continue;
      const x = xOf(lon);
      const y = yOf(lat);
      const len = clampInt(Math.round((sp as number) * 0.7), 6, 28);
      const rad = (((dir as number) - 180) * Math.PI) / 180; // draw "to" direction visually
      const x2 = x + Math.sin(rad) * len;
      const y2 = y + Math.cos(rad) * len;
      const stroke = "rgba(255,255,255,.85)";
      parts.push(`<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="1.4"/>`);
      // simple arrow head
      const ah = 5;
      const a1 = rad + Math.PI * 0.85;
      const a2 = rad - Math.PI * 0.85;
      parts.push(
        `<line x1="${x2}" y1="${y2}" x2="${x2 + Math.sin(a1) * ah}" y2="${y2 + Math.cos(a1) * ah}" stroke="${stroke}" stroke-width="1.4"/>`,
        `<line x1="${x2}" y1="${y2}" x2="${x2 + Math.sin(a2) * ah}" y2="${y2 + Math.cos(a2) * ah}" stroke="${stroke}" stroke-width="1.4"/>`,
      );
    }
  }

  parts.push(
    `<text x="${pad}" y="${H - 14}" fill="rgba(255,255,255,.45)" font-size="11" font-family="ui-sans-serif, system-ui">Data: Open‑Meteo GFS grid samples · Rendered by SeaLink</text>`,
    `</svg>`,
  );

  return parts.join("");
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const region = parseRegionId(url.searchParams.get("region")) ?? "europe";
  const layer = parseLayerId(url.searchParams.get("layer")) ?? "wind10m";
  const leadHoursRaw = Number(url.searchParams.get("lead") ?? "0");

  const leadHours = clampInt(Math.round(leadHoursRaw / STEP_H) * STEP_H, 0, MAX_LEAD_H);
  if (leadHours % STEP_H !== 0) {
    return NextResponse.json({ error: `lead must be multiple of ${STEP_H}` }, { status: 400 });
  }

  const sKey = svgKey(region, layer, leadHours);
  const hitSvg = svgCache.get(sKey);
  if (hitSvg && Date.now() - hitSvg.storedAtMs < SVG_TTL_MS) {
    return new NextResponse(hitSvg.svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=21600, s-maxage=21600",
        "X-Sealink-Chart-Cache": "HIT",
      },
    });
  }

  const existingSvg = inflightSvg.get(sKey);
  if (existingSvg) {
    const svg = await existingSvg;
    return new NextResponse(svg, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "X-Sealink-Chart-Cache": "HIT-INFLIGHT" },
    });
  }

  const pSvg = (async () => {
    const gKey = gridKey(region);
    const hitGrid = gridCache.get(gKey);
    let grid: GridCacheEntry;

    if (hitGrid && Date.now() - hitGrid.storedAtMs < GRID_TTL_MS) {
      grid = hitGrid;
    } else {
      const existingGrid = inflightGrid.get(gKey);
      if (existingGrid) {
        grid = await existingGrid;
      } else {
        const pGrid = fetchOpenMeteoGrid(region, req.signal).finally(() => inflightGrid.delete(gKey));
        inflightGrid.set(gKey, pGrid);
        grid = await pGrid;
      }
      gridCache.set(gKey, grid);
    }

    const svg = renderSvg({ region, layer, leadHours, grid });
    svgCache.set(sKey, { storedAtMs: Date.now(), svg });
    return svg;
  })().finally(() => inflightSvg.delete(sKey));

  inflightSvg.set(sKey, pSvg);

  try {
    const svg = await pSvg;
    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=600, s-maxage=21600",
        "X-Sealink-Chart-Cache": "MISS",
      },
    });
  } catch {
    return NextResponse.json({ error: "Upstream data unavailable" }, { status: 502 });
  }
}

