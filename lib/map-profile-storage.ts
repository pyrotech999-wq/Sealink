/** Browser-only keys for map identity shown at your GPS pin. */
export const MAP_PROFILE = {
  boat: "sealink_map_boat_name",
  avatar: "sealink_map_avatar_dataurl",
  bgConsent: "sealink_map_bg_location_consent",
  /** Opt in to appear on other members’ maps when within ~5 mi and sharing GPS. */
  shareNearby: "sealink_map_share_nearby",
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

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
