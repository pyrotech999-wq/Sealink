/**
 * Optional bridge for **native** shells (Android WebView, TWA, iOS WKWebView) that expose
 * platform-grade fixes while the web UI stays the same.
 *
 * ### Android (recommended)
 * Inject before the page loads, e.g. via `addJavascriptInterface` + `evaluateJavascript`:
 * - Use `FusedLocationProviderClient`
 * - Manifest: `ACCESS_FINE_LOCATION` (and background if you extend tracking)
 * - `LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)`
 * - `requestLocationUpdates(...)` for live fixes (avoid relying on `getLastLocation` alone for anchor drift)
 *
 * ### iOS (recommended)
 * - `CLLocationManager`, `desiredAccuracy = kCLLocationAccuracyBest`
 * - For iOS 14+, handle `accuracyAuthorization` / reduced accuracy: call
 *   `requestTemporaryFullAccuracy(withPurposeKey:)` when you need survey-grade anchor checks,
 *   and guide the user to **Settings → App → Location → Precise Location: On** if still approximate.
 *
 * ### WebView contract
 * Assign to `window.__SEALINK_NATIVE_LOCATION__` an object matching {@link SeaLinkNativeLocation}.
 */

export type SeaLinkNativeLocationFix = {
  latitude: number;
  longitude: number;
  /** 68% confidence radius in metres (same idea as `Coordinates.accuracy`). */
  accuracyM: number;
  timestampMs: number;
};

export type SeaLinkNativeLocation = {
  readonly isAvailable: true;
  watchPosition(
    onSuccess: (fix: SeaLinkNativeLocationFix) => void,
    onError: (code: string, message: string) => void,
  ): { remove: () => void };
};

declare global {
  interface Window {
    __SEALINK_NATIVE_LOCATION__?: SeaLinkNativeLocation;
  }
}

export function getNativeLocationBridge(): SeaLinkNativeLocation | null {
  if (typeof window === "undefined") return null;
  const b = window.__SEALINK_NATIVE_LOCATION__;
  if (b && b.isAvailable === true && typeof b.watchPosition === "function") return b;
  return null;
}
