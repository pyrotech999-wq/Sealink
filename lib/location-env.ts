import { Capacitor } from "@capacitor/core";

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

/** Best-effort package id for the browser rendering this page (Android). */
export function guessAndroidBrowserPackage(): string {
  if (typeof navigator === "undefined") return "com.android.chrome";
  const ua = navigator.userAgent;
  if (/Firefox/i.test(ua)) return "org.mozilla.firefox";
  if (/SamsungBrowser/i.test(ua)) return "com.sec.android.app.sbrowser";
  if (/EdgA/i.test(ua)) return "com.microsoft.emmx";
  if (/Brave/i.test(ua)) return "com.brave.browser";
  if (/Opera|OPR/i.test(ua)) return "com.opera.browser";
  return "com.android.chrome";
}

/**
 * Opens this app (Capacitor Android) or the current browser in Android system “App info”,
 * where the user can set Location to precise / accurate. Websites cannot flip that switch automatically.
 */
export function openAndroidLocationAppDetailsSettings(): void {
  if (typeof window === "undefined") return;
  let pkg = guessAndroidBrowserPackage();
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    pkg = "com.sealink.app";
  }
  window.location.href = `intent:package:${pkg}#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;end`;
}
