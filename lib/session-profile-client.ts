import { clearAnchorAlertLocalStorage } from "@/lib/anchor-alert-storage";
import { BROADCAST_ALERT_INBOX_STORAGE_KEY } from "@/lib/broadcast-alert-inbox";
import { clearStoredDeviceName } from "@/lib/device-id";
import { normaliseEmail } from "@/lib/email-normalise";
import { HOME_OPENAI_CACHE_STORAGE_KEY } from "@/lib/openai-home-client-cache";
import { clearMapProfileLocalStorage } from "@/lib/map-profile-storage";
import { clearMessagingLastVisitStorage } from "@/lib/messaging-last-visit";

/**
 * Tracks which account’s map/anchor client caches are stored in this browser. When the signed-in email
 * changes (new password sign-in or OAuth), we clear per-user localStorage so the old profile does not leak.
 */
export const SESSION_PROFILE_EMAIL_STORAGE_KEY = "sealink_session_profile_email_v1";

const BROADCAST_HIDDEN_KEY = "sealink_broadcast_hidden_v1";
const MAP_LAST_GEO_KEY = "sealink_map_last_geo_v1";
const BROADCAST_SOUND_KEY = "sealink_broadcast_sound_v1";
const BROADCAST_SILENCED_KEY = "sealink_broadcast_alerts_silenced";
const LIFE_SEAS_POPUP_KEY = "sealink_life_seas_popup_day_v1";
const IFM_SHARE_CONTACT_KEY = "sealink_ifm_share_contact_v1";
const ANCHOR_ANDROID_TEST_MODE_KEY = "sealink_anchor_android_test_mode_v1";

/** Map, anchor, inbox, and other keys that are per-human, not per physical device. */
export function clearPerUserClientStorage(): void {
  if (typeof window === "undefined") return;
  try {
    clearMapProfileLocalStorage();
    clearAnchorAlertLocalStorage();
    clearStoredDeviceName();
    clearMessagingLastVisitStorage();
    window.localStorage.removeItem(HOME_OPENAI_CACHE_STORAGE_KEY);
    window.localStorage.removeItem(BROADCAST_ALERT_INBOX_STORAGE_KEY);
    window.localStorage.removeItem(BROADCAST_HIDDEN_KEY);
    window.localStorage.removeItem(MAP_LAST_GEO_KEY);
    window.localStorage.removeItem(BROADCAST_SOUND_KEY);
    window.localStorage.removeItem(BROADCAST_SILENCED_KEY);
    window.localStorage.removeItem(LIFE_SEAS_POPUP_KEY);
    window.localStorage.removeItem(IFM_SHARE_CONTACT_KEY);
    window.localStorage.removeItem(ANCHOR_ANDROID_TEST_MODE_KEY);
  } catch {
    /* private mode / quota */
  }
}

export function clearSessionProfileEmailBinding(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_PROFILE_EMAIL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Call when the server session email is known (after sign-in or from `/api/demo/me`). If the browser
 * was last bound to a different account, clears per-user caches then stores the new email.
 */
export function bindSessionProfileEmailFromServer(email: string): void {
  if (typeof window === "undefined") return;
  const next = normaliseEmail(email);
  if (!next) return;
  let prev: string | null = null;
  try {
    const raw = window.localStorage.getItem(SESSION_PROFILE_EMAIL_STORAGE_KEY)?.trim();
    prev = raw && raw.length > 0 ? normaliseEmail(raw) : null;
  } catch {
    /* ignore */
  }
  if (prev != null && prev !== next) {
    clearPerUserClientStorage();
  }
  try {
    window.localStorage.setItem(SESSION_PROFILE_EMAIL_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}
