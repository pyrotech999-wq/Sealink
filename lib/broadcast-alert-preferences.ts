const SILENCED_KEY = "sealink_broadcast_alerts_silenced";

/** When true, new nearby-broadcast toasts appear without playing a sound. */
export function getBroadcastAlertsSilenced(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SILENCED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBroadcastAlertsSilenced(silenced: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (silenced) window.localStorage.setItem(SILENCED_KEY, "1");
    else window.localStorage.removeItem(SILENCED_KEY);
  } catch {
    /* private mode */
  }
}
