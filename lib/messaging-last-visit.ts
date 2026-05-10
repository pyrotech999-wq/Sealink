/** When the user last opened `/messaging` — used to highlight new broadcasts / inbox on Home. */
export const MESSAGING_LAST_VISIT_STORAGE_KEY = "sealink_messaging_last_visit_iso_v1";

export function getMessagingLastVisitIso(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(MESSAGING_LAST_VISIT_STORAGE_KEY)?.trim();
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setMessagingLastVisitIso(iso: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MESSAGING_LAST_VISIT_STORAGE_KEY, iso);
  } catch {
    /* private mode */
  }
}

export function setMessagingLastVisitNow(): void {
  setMessagingLastVisitIso(new Date().toISOString());
}

export function clearMessagingLastVisitStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(MESSAGING_LAST_VISIT_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}
