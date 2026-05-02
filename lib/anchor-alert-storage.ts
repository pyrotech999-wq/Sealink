/** Allowed geofence radii (metres). */
export const ANCHOR_RADIUS_METRES_OPTIONS = [10, 20, 40, 50, 100, 150, 200] as const;
export type AnchorRadiusM = (typeof ANCHOR_RADIUS_METRES_OPTIONS)[number];

const ALLOWED_RADIUS = new Set<number>(ANCHOR_RADIUS_METRES_OPTIONS);

export type AnchorAlertConfig = {
  armed: boolean;
  lat: number | null;
  lng: number | null;
  radiusM: AnchorRadiusM;
  /** Allowed bearing change (0..360). 360 = off. */
  angleDeg: number;
  monitorDeviceId: string; // "this" or a registered device id
  /** Bearing from anchor to last checked fix (for angle-change logic). */
  lastBearingDeg: number | null;
  lastAlertAt: string | null;
};

const KEY = "sealink_anchor_alert_v1";

const DEFAULTS: AnchorAlertConfig = {
  armed: false,
  lat: null,
  lng: null,
  radiusM: 20,
  angleDeg: 360,
  monitorDeviceId: "this",
  lastBearingDeg: null,
  lastAlertAt: null,
};

export function parseAnchorRadiusM(value: unknown): AnchorRadiusM {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : Number.NaN;
  if (ALLOWED_RADIUS.has(n)) return n as AnchorRadiusM;
  return DEFAULTS.radiusM;
}

export function getAnchorAlertConfig(): AnchorAlertConfig {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AnchorAlertConfig> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULTS;
    const radiusM = parseAnchorRadiusM(parsed.radiusM);
    const angleRaw = typeof parsed.angleDeg === "number" && Number.isFinite(parsed.angleDeg) ? Math.round(parsed.angleDeg) : DEFAULTS.angleDeg;
    const angleDeg = Math.max(0, Math.min(360, angleRaw));
    return {
      armed: parsed.armed === true,
      lat: typeof parsed.lat === "number" && Number.isFinite(parsed.lat) ? parsed.lat : null,
      lng: typeof parsed.lng === "number" && Number.isFinite(parsed.lng) ? parsed.lng : null,
      radiusM,
      angleDeg,
      monitorDeviceId: typeof parsed.monitorDeviceId === "string" ? parsed.monitorDeviceId : "this",
      lastBearingDeg: typeof parsed.lastBearingDeg === "number" && Number.isFinite(parsed.lastBearingDeg) ? parsed.lastBearingDeg : null,
      lastAlertAt: typeof parsed.lastAlertAt === "string" ? parsed.lastAlertAt : null,
    };
  } catch {
    return DEFAULTS;
  }
}

export function setAnchorAlertConfig(next: AnchorAlertConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

