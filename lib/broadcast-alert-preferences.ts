const SILENCED_KEY = "sealink_broadcast_alerts_silenced";
/** Same key as MapBroadcastPanel — user “Message alert sound” checkbox (defaults on). */
const MESSAGE_SOUND_KEY = "sealink_broadcast_sound_v1";

/** When false, skip chimes for vicinity / DM alerts (matches Messaging page checkbox). */
export function getMessageAlertSoundOn(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(MESSAGE_SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

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
