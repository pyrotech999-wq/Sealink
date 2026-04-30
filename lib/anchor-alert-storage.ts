export type AnchorAlertConfig = {
  armed: boolean;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  lastAlertAt: string | null;
};

const KEY = "sealink_anchor_alert_v1";

const DEFAULTS: AnchorAlertConfig = {
  armed: false,
  lat: null,
  lng: null,
  radiusM: 60,
  lastAlertAt: null,
};

export function getAnchorAlertConfig(): AnchorAlertConfig {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AnchorAlertConfig> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULTS;
    const radiusM =
      typeof parsed.radiusM === "number" && Number.isFinite(parsed.radiusM)
        ? Math.max(20, Math.min(500, Math.round(parsed.radiusM)))
        : DEFAULTS.radiusM;
    return {
      armed: parsed.armed === true,
      lat: typeof parsed.lat === "number" && Number.isFinite(parsed.lat) ? parsed.lat : null,
      lng: typeof parsed.lng === "number" && Number.isFinite(parsed.lng) ? parsed.lng : null,
      radiusM,
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

