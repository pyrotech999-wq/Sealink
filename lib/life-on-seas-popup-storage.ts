const STORAGE_KEY = "sealink_life_seas_popup_day_v1";

/** Calendar day in the user's local timezone, `YYYY-MM-DD`. */
export function localCalendarDay(): string {
  return new Date().toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function wasLifeOnSeasPopupShownToday(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === localCalendarDay();
  } catch {
    return true;
  }
}

export function markLifeOnSeasPopupShownToday(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, localCalendarDay());
  } catch {
    /* private mode etc. */
  }
}
