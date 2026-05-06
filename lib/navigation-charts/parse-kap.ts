import type { KapGeoReferencePoint, KapMetadata, KapParseResult } from "@/lib/navigation-charts/kap-types";

const HEADER_SCAN_MAX = 512 * 1024;

/** BSB/KAP text header is terminated by SUB (0x1A), often followed by NUL — see libbsb format notes. */
export function extractKapHeaderText(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  const scanLen = Math.min(u8.byteLength, HEADER_SCAN_MAX);
  let end = scanLen;
  for (let i = 0; i < scanLen; i++) {
    if (u8[i] === 0x1a) {
      end = i;
      break;
    }
  }
  return new TextDecoder("latin1").decode(u8.subarray(0, end));
}

/** Merge continuation lines (4 leading spaces) per BSB/KAP convention. */
export function normalizeKapLines(header: string): string[] {
  const rawLines = header.split(/\r?\n/);
  const out: string[] = [];
  for (const line of rawLines) {
    if (line.startsWith("    ") && out.length) {
      out[out.length - 1] = `${out[out.length - 1]!} ${line.slice(4).trim()}`;
    } else {
      out.push(line);
    }
  }
  return out;
}

function latLngDecimal(deg: number, min: number, hem: string): number {
  let v = Math.abs(deg) + min / 60;
  const h = hem.toUpperCase();
  if (h === "S" || h === "W") v = -v;
  return v;
}

/** Try decimal degrees after pixel columns: REF/n, W, px, py, lat, NS, lon, EW */
const REF_DECIMAL_RE =
  /^REF\/(\d+)\s*,\s*([A-Za-z]?)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*([\d.]+)\s*,\s*([NSns])\s*,\s*([\d.]+)\s*,\s*([EWew])/;

/** Deg + decimal minutes: REF/n, W, px, py, latDeg, latMin, NS, lonDeg, lonMin, EW */
const REF_DEG_MIN_RE =
  /^REF\/(\d+)\s*,\s*([A-Za-z]?)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*,\s*([NSns])\s*,\s*(\d+)\s*,\s*([\d.]+)\s*,\s*([EWew])/;

function parseRefLine(line: string): KapGeoReferencePoint | null {
  const t = line.trim();
  let m = t.match(REF_DECIMAL_RE);
  if (m) {
    const lat = latLngDecimal(parseFloat(m[5]!), 0, m[6]!);
    const lng = latLngDecimal(parseFloat(m[7]!), 0, m[8]!);
    return {
      index: Number(m[1]),
      corner: m[2] || undefined,
      pixelX: Number(m[3]),
      pixelY: Number(m[4]),
      lat,
      lng,
      raw: t,
    };
  }
  m = t.match(REF_DEG_MIN_RE);
  if (m) {
    const lat = latLngDecimal(Number(m[5]!), parseFloat(m[6]!), m[7]!);
    const lng = latLngDecimal(Number(m[8]!), parseFloat(m[9]!), m[10]!);
    return {
      index: Number(m[1]),
      corner: m[2] || undefined,
      pixelX: Number(m[3]),
      pixelY: Number(m[4]),
      lat,
      lng,
      raw: t,
    };
  }
  return null;
}

/** PLY/n followed by n lines of lat,lon pairs (several NOAA variants). */
function parsePlySection(lines: string[], startIdx: number): { corners: { lat: number; lng: number }[]; nextIdx: number } {
  const line = lines[startIdx]?.trim() ?? "";
  const head = line.match(/^PLY\/(\d+)/i);
  if (!head) return { corners: [], nextIdx: startIdx };
  const n = Number(head[1]);
  const corners: { lat: number; lng: number }[] = [];
  let i = startIdx + 1;
  while (corners.length < n && i < lines.length) {
    const L = lines[i]!.trim();
    if (!L || /^[A-Z]{3}\//.test(L)) break;
    const parts = L.split(/[, \t]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]!);
      const lng = parseFloat(parts[1]!);
      if (Number.isFinite(lat) && Number.isFinite(lng)) corners.push({ lat, lng });
    }
    i++;
  }
  return { corners, nextIdx: i };
}

function boundsFromPoints(pts: { lat: number; lng: number }[]): [[number, number], [number, number]] | null {
  if (!pts.length) return null;
  let minLat = pts[0]!.lat;
  let maxLat = pts[0]!.lat;
  let minLng = pts[0]!.lng;
  let maxLng = pts[0]!.lng;
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  if (!Number.isFinite(minLat) || minLat === maxLat) return null;
  const padLat = Math.max((maxLat - minLat) * 0.02, 0.001);
  const padLng = Math.max((maxLng - minLng) * 0.02, 0.001);
  return [
    [minLat - padLat, minLng - padLng],
    [maxLat + padLat, maxLng + padLng],
  ];
}

function parseBsbFields(segment: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = segment.split(",").map((p) => p.trim());
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq > 0) {
      const k = p.slice(0, eq).trim();
      const v = p.slice(eq + 1).trim();
      if (k) out[k] = v;
    }
  }
  return out;
}

/**
 * Initial KAP/BSB text-header parse — raster RLE body and colour tables are not decoded.
 * TODO: Full BSB/KAP binary section — RLE row unpack, colour map IFM/RGB, index table.
 * TODO: Raster image extraction to Canvas / ImageBitmap for true chart paint.
 */
export function parseKapFile(buf: ArrayBuffer): KapParseResult {
  if (buf.byteLength < 32) {
    return { ok: false, error: "File too small to be a valid KAP chart." };
  }

  const headerText = extractKapHeaderText(buf);
  if (!/[A-Z]{3}\//.test(headerText)) {
    return { ok: false, error: "Invalid KAP file — no recognised BSB/KAP header tokens." };
  }

  const lines = normalizeKapLines(headerText);
  const metadata: KapMetadata = {
    chartName: null,
    version: null,
    rasterWidth: null,
    rasterHeight: null,
    projection: null,
    datum: null,
    scale: null,
    referencePoints: [],
    polygonCorners: [],
    bounds: null,
  };

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]!.trim();
    if (!raw || raw.startsWith("!")) continue;

    if (raw.startsWith("VER/")) {
      metadata.version = raw.slice(4).trim() || null;
      continue;
    }

    if (raw.startsWith("BSB/") || raw.startsWith("NOS/")) {
      const fields = parseBsbFields(raw.replace(/^BSB\//i, "").replace(/^NOS\//i, ""));
      if (fields.NA) metadata.chartName = fields.NA;
      if (fields.RA) {
        const ra = fields.RA.split(/[,x]/i).map((s) => parseInt(s.trim(), 10));
        if (ra.length >= 2 && Number.isFinite(ra[0]) && Number.isFinite(ra[1])) {
          metadata.rasterWidth = ra[0]!;
          metadata.rasterHeight = ra[1]!;
        }
      }
      continue;
    }

    if (raw.startsWith("CHT/")) {
      const fields = parseBsbFields(raw.slice(4));
      if (fields.NA) metadata.chartName = fields.NA;
      continue;
    }

    if (raw.startsWith("KNP/")) {
      const body = raw.slice(4);
      const pr = body.match(/PR=([^,]+)/i);
      if (pr) metadata.projection = pr[1]!.trim();
      const gd = body.match(/GD=([^,]+)/i);
      if (gd) metadata.datum = gd[1]!.trim();
      const sc = body.match(/SC=([^,]+)/i);
      if (sc) metadata.scale = sc[1]!.trim();
      continue;
    }

    if (raw.startsWith("DTM/")) {
      const rest = raw.slice(4);
      if (rest && !metadata.datum) metadata.datum = rest.split(",")[0]!.trim();
      continue;
    }

    if (/^REF\//i.test(raw)) {
      const pt = parseRefLine(raw);
      if (pt) metadata.referencePoints.push(pt);
      continue;
    }

    if (/^PLY\//i.test(raw)) {
      const { corners, nextIdx } = parsePlySection(lines, li);
      metadata.polygonCorners = corners;
      li = nextIdx - 1;
      continue;
    }
  }

  const forBounds: { lat: number; lng: number }[] = [
    ...metadata.referencePoints.map((r) => ({ lat: r.lat, lng: r.lng })),
    ...metadata.polygonCorners,
  ];
  metadata.bounds = boundsFromPoints(forBounds);

  if (!metadata.chartName && metadata.referencePoints.length === 0 && metadata.polygonCorners.length === 0) {
    return {
      ok: false,
      error: "Invalid KAP file — could not read chart name or georeference corners.",
    };
  }

  return { ok: true, metadata, headerTextLength: headerText.length };
}
