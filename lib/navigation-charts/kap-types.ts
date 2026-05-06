/** Parsed georeference tie-point from a BSB/KAP header (pixel ↔ lat/lon). */
export type KapGeoReferencePoint = {
  index: number;
  /** Corner label when present, e.g. W for west. */
  corner?: string;
  pixelX: number;
  pixelY: number;
  lat: number;
  lng: number;
  raw: string;
};

/** Initial metadata extracted from a .kap text header (raster body not decoded). */
export type KapMetadata = {
  chartName: string | null;
  version: string | null;
  rasterWidth: number | null;
  rasterHeight: number | null;
  projection: string | null;
  datum: string | null;
  scale: string | null;
  referencePoints: KapGeoReferencePoint[];
  /** Closed polygon from PLY/ corners when present (WGS84-like decimal degrees). */
  polygonCorners: { lat: number; lng: number }[];
  /** South-west and north-east corners for Leaflet [[south, west], [north, east]]. */
  bounds: [[number, number], [number, number]] | null;
};

export type KapParseResult =
  | { ok: true; metadata: KapMetadata; headerTextLength: number }
  | { ok: false; error: string };
