/** Heuristic: iPhone / iPad / iOS WebView (excludes desktop Safari unless touch iPad mode). */
export function isLikelyIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
}

export function isLikelyAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

export type GeolocationPermissionStateHint = PermissionState | "unsupported";

/** Best-effort; many mobile browsers omit or partially implement the Permissions API for geolocation. */
export async function queryGeolocationPermissionHint(): Promise<GeolocationPermissionStateHint> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unsupported";
  try {
    const q = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return q.state;
  } catch {
    return "unsupported";
  }
}
