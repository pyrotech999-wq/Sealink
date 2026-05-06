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

/** Byte index of first SUB (0x1A) that terminates the text header, or -1. */
export function findKapHeaderTerminatorIndex(buf: ArrayBuffer): number {
  const u8 = new Uint8Array(buf);
  const scanLen = Math.min(u8.byteLength, HEADER_SCAN_MAX);
  for (let i = 0; i < scanLen; i++) {
    if (u8[i] === 0x1a) return i;
  }
  return -1;
}

/** First byte index of packed BSB raster after SUB (+ optional NUL), per GDAL BSB. */
export function getKapBinaryPayloadByteOffset(buf: ArrayBuffer): number {
  const u8 = new Uint8Array(buf);
  const sep = findKapHeaderTerminatorIndex(buf);
  if (sep < 0) throw new Error("No KAP header terminator (0x1A SUB) found.");
  const after = sep + 1;
  if (after < u8.length && u8[after] === 0x00) return sep + 2;
  return sep + 1;
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

function decimalLat(deg: number, min: number, hem: string): number {
  const v = Math.abs(deg) + min / 60;
  return hem.toUpperCase() === "S" ? -v : v;
}

function decimalLng(deg: number, min: number, hem: string): number {
  const v = Math.abs(deg) + min / 60;
  return hem.toUpperCase() === "W" ? -v : v;
}

function decimalLatOne(deg: number, hem: string): number {
  const v = Math.abs(deg);
  return hem.toUpperCase() === "S" ? -v : v;
}

function decimalLngOne(deg: number, hem: string): number {
  const v = Math.abs(deg);
  return hem.toUpperCase() === "W" ? -v : v;
}

/** REF/n, px, py, lat°, lon° (signed decimals) — common in BSB 3 / OpenCPN examples. */
const REF_PX_LATLON_SIGNED_RE =
  /^REF\/(\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/;

/** Try decimal degrees after pixel columns: REF/n, W, px, py, lat, NS, lon, EW */
const REF_DECIMAL_RE =
  /^REF\/(\d+)\s*,\s*([A-Za-z]?)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*([\d.]+)\s*,\s*([NSns])\s*,\s*([\d.]+)\s*,\s*([EWew])/;

/** Deg + decimal minutes: REF/n, W, px, py, latDeg, latMin, NS, lonDeg, lonMin, EW */
const REF_DEG_MIN_RE =
  /^REF\/(\d+)\s*,\s*([A-Za-z]?)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*,\s*([NSns])\s*,\s*(\d+)\s*,\s*([\d.]+)\s*,\s*([EWew])/;

function parseRefLine(line: string): KapGeoReferencePoint | null {
  const t = line.trim();
  let m = t.match(REF_PX_LATLON_SIGNED_RE);
  if (m) {
    const lat = parseFloat(m[4]!);
    const lng = parseFloat(m[5]!);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        index: Number(m[1]),
        pixelX: Number(m[2]),
        pixelY: Number(m[3]),
        lat,
        lng,
        raw: t,
      };
    }
  }
  m = t.match(REF_DECIMAL_RE);
  if (m) {
    const lat = decimalLatOne(parseFloat(m[5]!), m[6]!);
    const lng = decimalLngOne(parseFloat(m[7]!), m[8]!);
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
    const lat = decimalLat(Number(m[5]!), parseFloat(m[6]!), m[7]!);
    const lng = decimalLng(Number(m[8]!), parseFloat(m[9]!), m[10]!);
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
  const rest = line.replace(/^PLY\/\d+/i, "").trim();
  if (rest) {
    const nums = rest.split(/[, \t]+/).map((s) => parseFloat(s.trim())).filter((x) => Number.isFinite(x));
    for (let k = 0; k + 1 < nums.length && corners.length < n; k += 2) {
      corners.push({ lat: nums[k]!, lng: nums[k + 1]! });
    }
    if (corners.length >= n) return { corners, nextIdx: startIdx + 1 };
  }
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
  if (!Number.isFinite(minLat) || (maxLat - minLat < 1e-6 && maxLng - minLng < 1e-6)) return null;
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

/** RA= is always width,height — naive comma-splitting breaks it (RA=800,600 → RA=800 only). */
function extractRaFromHeaderText(s: string): { w: number; h: number } | null {
  const m = s.match(/\bRA\s*=\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

/**
 * NA= may run to NU= without a comma (OpenCPN / pilot charts). Comma-splitting also breaks NA when
 * the name contains commas. Prefer boundary before NU= / RA=.
 */
function extractNaFromHeaderText(s: string): string | null {
  const m = s.match(
    /\bNA\s*=\s*(.+?)(?=\s+NU\s*=|\s*NU\s*=|\s*,\s*NU\s*=|\s*,\s*RA\s*=|\s+RA\s*=|$)/i,
  );
  if (m?.[1]) return m[1].trim().replace(/\s+NU\s*=\s*$/i, "").trim();
  const m2 = s.match(/\bNA\s*=\s*([^,]+)/i);
  return m2?.[1]?.trim() ?? null;
}

/** Initial KAP/BSB text-header parse; packed raster is decoded separately in `extract-kap-raster.ts`. */
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
    paletteEntries: [],
  };

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]!.trim();
    if (!raw || raw.startsWith("!")) continue;

    if (raw.startsWith("VER/")) {
      metadata.version = raw.slice(4).trim() || null;
      continue;
    }

    if (raw.startsWith("BSB/") || raw.startsWith("NOS/")) {
      const body = raw.replace(/^BSB\//i, "").replace(/^NOS\//i, "");
      const fields = parseBsbFields(body);
      const na = extractNaFromHeaderText(body) ?? fields.NA ?? null;
      if (na) metadata.chartName = na;
      const ra = extractRaFromHeaderText(body);
      if (ra) {
        metadata.rasterWidth = ra.w;
        metadata.rasterHeight = ra.h;
      }
      continue;
    }

    if (raw.startsWith("CHT/")) {
      const body = raw.slice(4);
      const fields = parseBsbFields(body);
      const na = extractNaFromHeaderText(body) ?? fields.NA ?? null;
      if (na) metadata.chartName = na;
      const ra = extractRaFromHeaderText(body);
      if (ra) {
        metadata.rasterWidth = ra.w;
        metadata.rasterHeight = ra.h;
      }
      continue;
    }

    if (raw.startsWith("RGB/")) {
      const m = raw.match(
        /^RGB\/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i,
      );
      if (m) {
        metadata.paletteEntries.push({
          index: Number(m[1]),
          r: Number(m[2]),
          g: Number(m[3]),
          b: Number(m[4]),
        });
      }
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
      const afterIdx = raw.replace(/^PLY\/\d+/i, "").trim();
      if (afterIdx) {
        const cm = afterIdx.match(/^([-.\d]+)\s*,\s*([-.\d]+)/);
        if (cm) {
          const lat = parseFloat(cm[1]!);
          const lng = parseFloat(cm[2]!);
          if (
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            Math.abs(lat) <= 90 &&
            Math.abs(lng) <= 180
          ) {
            metadata.polygonCorners.push({ lat, lng });
            continue;
          }
        }
      }
      const { corners, nextIdx } = parsePlySection(lines, li);
      if (corners.length) metadata.polygonCorners = corners;
      li = nextIdx - 1;
      continue;
    }
  }

  const forBounds: { lat: number; lng: number }[] = [
    ...metadata.referencePoints.map((r) => ({ lat: r.lat, lng: r.lng })),
    ...metadata.polygonCorners,
  ];
  metadata.bounds = boundsFromPoints(forBounds);

  if (metadata.rasterWidth == null || metadata.rasterHeight == null) {
    const ra = extractRaFromHeaderText(headerText);
    if (ra) {
      metadata.rasterWidth = ra.w;
      metadata.rasterHeight = ra.h;
    }
  }

  const hasStructure =
    metadata.version != null ||
    metadata.chartName != null ||
    metadata.rasterWidth != null ||
    metadata.referencePoints.length > 0 ||
    metadata.polygonCorners.length > 0;
  if (!hasStructure) {
    return { ok: false, error: "Invalid KAP file — header did not contain chart metadata." };
  }

  /** No fake bounds: if REF/PLY did not yield a box, leave null so the map does not jump to the wrong ocean. */
  return { ok: true, metadata, headerTextLength: headerText.length };
}
