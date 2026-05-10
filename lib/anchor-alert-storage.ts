/** Allowed geofence radii (metres) for normal users. */
export const ANCHOR_RADIUS_METRES_OPTIONS = [10, 20, 40, 50, 100, 150, 200] as const;
/** Admin-only: tiny ring to exercise anchor alerts (GPS jitter dominates; not for real anchoring). */
export const ANCHOR_RADIUS_ADMIN_TEST_M = 2 as const;
export type AnchorRadiusM = (typeof ANCHOR_RADIUS_METRES_OPTIONS)[number] | typeof ANCHOR_RADIUS_ADMIN_TEST_M;

const ALLOWED_STANDARD = new Set<number>(ANCHOR_RADIUS_METRES_OPTIONS);

export type ParseAnchorRadiusOpts = {
  /** When true, allow persisting or choosing the 2 m admin test radius. */
  isAdmin?: boolean;
  /** When true, accept 2 m when reading server-persisted config (only admins can write it via API). */
  fromTrustedStore?: boolean;
};

export type GetAnchorAlertConfigOpts = {
  isAdmin?: boolean;
};

export function getAnchorRadiusOptionsForUi(isAdmin: boolean): readonly AnchorRadiusM[] {
  if (isAdmin) return [ANCHOR_RADIUS_ADMIN_TEST_M, ...ANCHOR_RADIUS_METRES_OPTIONS];
  return ANCHOR_RADIUS_METRES_OPTIONS;
}

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
  /**
   * When true (server geofence row), non-monitor devices should not surface new drift anchor inbox pop-ups
   * until the boat clears it (e.g. after RESET_ANCHOR).
   */
  remoteAlarmSilencedUntilReset?: boolean;
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
  remoteAlarmSilencedUntilReset: false,
};

export function parseAnchorRadiusM(value: unknown, opts?: ParseAnchorRadiusOpts): AnchorRadiusM {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : Number.NaN;
  if (n === ANCHOR_RADIUS_ADMIN_TEST_M && (opts?.isAdmin === true || opts?.fromTrustedStore === true)) {
    return ANCHOR_RADIUS_ADMIN_TEST_M;
  }
  if (ALLOWED_STANDARD.has(n)) return n as AnchorRadiusM;
  return DEFAULTS.radiusM;
}

/** Next larger step in {@link ANCHOR_RADIUS_METRES_OPTIONS}, or `null` if already at the maximum (200 m). */
export function nextLargerStandardAnchorRadiusM(
  currentM: unknown,
  opts?: { fromTrustedStore?: boolean },
): number | null {
  const cur = parseAnchorRadiusM(currentM, { fromTrustedStore: opts?.fromTrustedStore === true });
  for (const o of ANCHOR_RADIUS_METRES_OPTIONS) {
    if (o > cur) return o;
  }
  return null;
}

/** Add metres to current radius, then snap up to the smallest allowed option that is still ≥ min(200, cur+delta). */
export function anchorRadiusAfterAddingMeters(
  currentM: unknown,
  addM: number,
  opts?: { fromTrustedStore?: boolean },
): AnchorRadiusM {
  const cur = parseAnchorRadiusM(currentM, { fromTrustedStore: opts?.fromTrustedStore === true });
  const target = Math.min(200, Math.round(Number(cur) + addM));
  for (const o of ANCHOR_RADIUS_METRES_OPTIONS) {
    if (o >= target) return o;
  }
  return ANCHOR_RADIUS_METRES_OPTIONS[ANCHOR_RADIUS_METRES_OPTIONS.length - 1]!;
}

export function getAnchorAlertConfig(opts?: GetAnchorAlertConfigOpts): AnchorAlertConfig {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AnchorAlertConfig> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULTS;
    const radiusM = parseAnchorRadiusM(parsed.radiusM, { isAdmin: opts?.isAdmin === true });
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
      remoteAlarmSilencedUntilReset:
        typeof parsed.remoteAlarmSilencedUntilReset === "boolean" ? parsed.remoteAlarmSilencedUntilReset : false,
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

export function clearAnchorAlertLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

