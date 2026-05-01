import type { VesselClassifiedListing } from "@/lib/vessel-classifieds-types";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const TTL_DAYS = 180; // ~6 months
export const VESSEL_REMINDER_DAYS_BEFORE = 7;

export function defaultExpiresAt(created: Date): string {
  return new Date(created.getTime() + TTL_DAYS * DAY_MS).toISOString();
}

export function nextExpiryFrom(now: Date, prevExpiresAt?: string | null): string {
  const baseMs = prevExpiresAt ? new Date(prevExpiresAt).getTime() : NaN;
  const startMs = Number.isFinite(baseMs) && baseMs > now.getTime() ? baseMs : now.getTime();
  return new Date(startMs + TTL_DAYS * DAY_MS).toISOString();
}

export function daysUntilExpiry(expiresAt: string, now: Date): number {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.ceil(ms / DAY_MS);
}

export function isInReminderWindow(expiresAt: string, now: Date, daysBefore = VESSEL_REMINDER_DAYS_BEFORE): boolean {
  const d = daysUntilExpiry(expiresAt, now);
  return d >= 0 && d <= daysBefore;
}

export function applyExpiry(list: VesselClassifiedListing[], now: Date): { next: VesselClassifiedListing[]; changed: boolean } {
  let changed = false;
  const nowMs = now.getTime();
  const next = list.map((l) => {
    if (l.status === "removed") return l;
    if (l.status === "expired") return l;
    if (new Date(l.expiresAt).getTime() <= nowMs) {
      changed = true;
      return { ...l, status: "expired" as const };
    }
    return l;
  });
  return { next, changed };
}
