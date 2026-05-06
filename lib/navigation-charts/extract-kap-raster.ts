import type { KapMetadata } from "@/lib/navigation-charts/kap-types";
import { getKapBinaryPayloadByteOffset } from "@/lib/navigation-charts/parse-kap";

const MAX_DIM = 32000;
/** Large pilot / planning KAPs (e.g. OpenCPN) can exceed 25M px; cap still guards against accidental OOM in the browser. */
const MAX_PIXELS = 60_000_000;

export type KapRasterResult = {
  dataUrl: string;
  width: number;
  height: number;
};

function buildPaletteRgba(metadata: KapMetadata): Uint8ClampedArray {
  if (!metadata.paletteEntries.length) {
    throw new Error("No RGB/ colour table in KAP header — cannot decode raster.");
  }
  let maxIdx = 0;
  for (const e of metadata.paletteEntries) {
    if (Number.isFinite(e.index)) maxIdx = Math.max(maxIdx, e.index);
  }
  const len = Math.max(maxIdx + 1, 256);
  const pal = new Uint8ClampedArray(len * 4);
  for (let i = 0; i < len; i++) {
    const o = i * 4;
    pal[o] = 0;
    pal[o + 1] = 0;
    pal[o + 2] = 0;
    pal[o + 3] = 255;
  }
  for (const e of metadata.paletteEntries) {
    if (e.index < 0 || e.index >= len) continue;
    const o = e.index * 4;
    pal[o] = e.r & 255;
    pal[o + 1] = e.g & 255;
    pal[o + 2] = e.b & 255;
    pal[o + 3] = 255;
  }
  return pal;
}

function readLineMarker(u8: Uint8Array, start: number, scanline: number): { marker: number; next: number } {
  let i = start;
  let nLineMarker = 0;
  let byNext: number;
  do {
    if (i >= u8.length) throw new Error("Unexpected end of file while reading scanline marker.");
    byNext = u8[i++]!;
    while (scanline !== 0 && nLineMarker === 0 && byNext === 0 && i < u8.length) {
      byNext = u8[i++]!;
    }
    nLineMarker = nLineMarker * 128 + (byNext & 0x7f);
  } while ((byNext & 0x80) !== 0);
  return { marker: nLineMarker, next: i };
}

function decodeRasterLine(
  u8: Uint8Array,
  start: number,
  width: number,
  nColorSize: number,
): { row: Uint8Array; next: number } {
  const nValueShift = 7 - nColorSize;
  const byValueMask = ((((1 << nColorSize) - 1) << nValueShift) & 0xff) >>> 0;
  const byCountMask = (1 << (7 - nColorSize)) - 1;
  const row = new Uint8Array(width);
  let iPixel = 0;
  let i = start;
  let guard = 0;
  const maxGuard = width + 64;

  do {
    let byNext: number;
    while (i < u8.length) {
      byNext = u8[i++]!;
      if (byNext === 0) break;
      const nPixValue = (byNext & byValueMask) >> nValueShift;
      let nRunCount = byNext & byCountMask;
      let cont = byNext;
      while ((cont & 0x80) !== 0) {
        if (i >= u8.length) throw new Error("Truncated BSB run in scanline.");
        byNext = u8[i++]!;
        if (nRunCount > (0x7fffffff - (byNext & 0x7f)) / 128) {
          throw new Error("Corrupted BSB run length (overflow).");
        }
        nRunCount = nRunCount * 128 + (byNext & 0x7f);
        cont = byNext;
      }
      let nFill = nRunCount + 1;
      if (iPixel + nFill > width) nFill = width - iPixel;
      for (let k = 0; k < nFill; k++) row[iPixel++] = nPixValue;
    }
    if (iPixel === width - 1) row[iPixel++] = 0;
    guard++;
    if (guard > maxGuard) {
      throw new Error("BSB scanline RLE decode exceeded expected iterations — corrupt or unsupported KAP.");
    }
  } while (iPixel < width);

  while (iPixel < width) row[iPixel++] = 0;
  return { row, next: i };
}

/**
 * Decode BSB/KAP packed raster (GDAL-style RLE) into a PNG data URL for Leaflet ImageOverlay.
 * Runs in the browser only (uses Canvas).
 */
export function extractKapRaster(buf: ArrayBuffer, metadata: KapMetadata): KapRasterResult {
  const w = metadata.rasterWidth;
  const h = metadata.rasterHeight;
  if (w == null || h == null || w <= 0 || h <= 0) {
    throw new Error("KAP header missing RA= width/height — cannot decode raster.");
  }
  if (w > MAX_DIM || h > MAX_DIM) {
    throw new Error(`Raster dimensions ${w}×${h} exceed safe limit (${MAX_DIM}).`);
  }
  if (w * h > MAX_PIXELS) {
    throw new Error(
      `Raster pixel count (${w * h}) exceeds SeaLink’s browser decode limit (${MAX_PIXELS.toLocaleString()} px). ` +
        `Try a smaller-scale chart cell, or open this file in OpenCPN / a desktop chart app.`,
    );
  }

  const u8 = new Uint8Array(buf);
  let off = getKapBinaryPayloadByteOffset(buf);
  if (off >= u8.length) throw new Error("Binary raster section is empty or truncated.");

  let nColorSize = u8[off]!;
  off += 1;
  if (nColorSize >= 0x31 && nColorSize <= 0x38) nColorSize -= 0x30;
  if (!(nColorSize > 0 && nColorSize <= 7)) {
    throw new Error(
      `Invalid BSB colour index bit size (${nColorSize}). The file may be corrupt, encrypted, or not a standard raster KAP.`,
    );
  }

  const pal = buildPaletteRgba(metadata);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context for raster decode.");
  const img = ctx.createImageData(w, h);
  const data = img.data;

  for (let y = 0; y < h; y++) {
    const { marker, next } = readLineMarker(u8, off, y);
    off = next;
    const expected0 = y;
    const expected1 = y + 1;
    if (marker !== expected0 && marker !== expected1) {
      // Lenient: many files are consistent; log mismatch but continue (GDAL BSB_IGNORE_LINENUMBERS-style).
      if (typeof console !== "undefined" && console.debug) {
        console.debug(`[extractKapRaster] scanline ${y}: file line id ${marker} (expected ${expected0} or ${expected1})`);
      }
    }
    const { row, next: nextOff } = decodeRasterLine(u8, off, w, nColorSize);
    off = nextOff;
    let rowBase = y * w * 4;
    for (let x = 0; x < w; x++) {
      const idx = row[x]!;
      const po = (idx < pal.length / 4 ? idx : 0) * 4;
      data[rowBase] = pal[po]!;
      data[rowBase + 1] = pal[po + 1]!;
      data[rowBase + 2] = pal[po + 2]!;
      data[rowBase + 3] = pal[po + 3]!;
      rowBase += 4;
    }
  }

  ctx.putImageData(img, 0, 0);
  const dataUrl = canvas.toDataURL("image/png");
  if (!dataUrl || dataUrl.length < 32) {
    throw new Error("Canvas export failed — chart may be too large for this browser.");
  }
  return { dataUrl, width: w, height: h };
}
