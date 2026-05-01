/** Browser-only keys for map identity shown at your GPS pin. */
export const MAP_PROFILE = {
  boat: "sealink_map_boat_name",
  fullName: "sealink_map_full_name",
  phone: "sealink_profile_phone",
  avatar: "sealink_map_avatar_dataurl",
  showAvatar: "sealink_map_show_avatar",
  bgConsent: "sealink_map_bg_location_consent",
  /** Opt in to appear on other members’ maps when within ~5 mi and sharing GPS. */
  shareNearby: "sealink_map_share_nearby",
  /** Share GPS on the home map (persisted; user can turn off anytime). */
  shareOnMap: "sealink_map_share_location",
} as const;

const MAX_AVATAR_BYTES = 450_000;

export function getBoatName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(MAP_PROFILE.boat)?.trim() ?? "";
}

export function setBoatName(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MAP_PROFILE.boat, name.trim().slice(0, 80));
}

export function getFullName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(MAP_PROFILE.fullName)?.trim() ?? "";
}

export function setFullName(name: string): void {
  if (typeof window === "undefined") return;
  const next = name.replace(/[\r\n]+/g, " ").trim().slice(0, 80);
  if (!next) {
    localStorage.removeItem(MAP_PROFILE.fullName);
    return;
  }
  localStorage.setItem(MAP_PROFILE.fullName, next);
}

export function getProfilePhone(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(MAP_PROFILE.phone)?.trim() ?? "";
}

export function setProfilePhone(phone: string): void {
  if (typeof window === "undefined") return;
  const next = phone.replace(/[\r\n]+/g, " ").trim().slice(0, 40);
  if (!next) localStorage.removeItem(MAP_PROFILE.phone);
  else localStorage.setItem(MAP_PROFILE.phone, next);
}

export function getAvatarDataUrl(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(MAP_PROFILE.avatar) ?? "";
}

export function setAvatarDataUrl(dataUrl: string | null): void {
  if (typeof window === "undefined") return;
  if (!dataUrl) {
    localStorage.removeItem(MAP_PROFILE.avatar);
    return;
  }
  if (dataUrl.length > MAX_AVATAR_BYTES) {
    throw new Error("Photo is too large. Try a smaller image (under ~300KB).");
  }
  localStorage.setItem(MAP_PROFILE.avatar, dataUrl);
}

/** Whether to show the stored profile image on the map pin (defaults on). */
export function getShowAvatar(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(MAP_PROFILE.showAvatar) !== "0";
}

export function setShowAvatar(on: boolean): void {
  if (typeof window === "undefined") return;
  if (on) localStorage.removeItem(MAP_PROFILE.showAvatar);
  else localStorage.setItem(MAP_PROFILE.showAvatar, "0");
}

/** Background-friendly GPS cadence is on unless the user explicitly pauses (`"0"` in storage). */
export function getBackgroundLocationConsent(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(MAP_PROFILE.bgConsent) !== "0";
}

export function setBackgroundLocationConsent(on: boolean): void {
  if (typeof window === "undefined") return;
  if (on) localStorage.removeItem(MAP_PROFILE.bgConsent);
  else localStorage.setItem(MAP_PROFILE.bgConsent, "0");
}

export function getShareNearbyPeers(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MAP_PROFILE.shareNearby) === "1";
}

export function setShareNearbyPeers(on: boolean): void {
  if (typeof window === "undefined") return;
  if (on) localStorage.setItem(MAP_PROFILE.shareNearby, "1");
  else localStorage.removeItem(MAP_PROFILE.shareNearby);
}

export function getShareOnMap(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MAP_PROFILE.shareOnMap) === "1";
}

export function setShareOnMap(on: boolean): void {
  if (typeof window === "undefined") return;
  if (on) localStorage.setItem(MAP_PROFILE.shareOnMap, "1");
  else localStorage.removeItem(MAP_PROFILE.shareOnMap);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
