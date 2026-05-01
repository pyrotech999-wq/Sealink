import type { GearListing } from "@/lib/gear-types";
import { GEAR_LISTING_TTL_DAYS, GEAR_REMINDER_DAYS_BEFORE } from "@/lib/gear-constants";

export const DAY_MS = 24 * 60 * 60 * 1000;

function ttlDays(): number {
  const n = Number(process.env.GEAR_LISTING_TTL_DAYS);
  return Number.isFinite(n) && n > 0 ? n : GEAR_LISTING_TTL_DAYS;
}

function reminderDays(): number {
  const n = Number(process.env.GEAR_REMINDER_DAYS_BEFORE);
  return Number.isFinite(n) && n > 0 ? n : GEAR_REMINDER_DAYS_BEFORE;
}

export function defaultExpiresAt(createdAt: Date): string {
  return new Date(createdAt.getTime() + ttlDays() * DAY_MS).toISOString();
}

export function extendExpiresFromCurrent(expiresAtIso: string): string {
  return new Date(new Date(expiresAtIso).getTime() + ttlDays() * DAY_MS).toISOString();
}

export function daysUntilExpiry(expiresAt: string, now = new Date()): number {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / DAY_MS);
}

export function isInReminderWindow(expiresAt: string, now = new Date()): boolean {
  const d = daysUntilExpiry(expiresAt, now);
  return d > 0 && d <= reminderDays();
}

export function applyPruneAndReminders(list: GearListing[], now: Date): { next: GearListing[]; changed: boolean } {
  const nowMs = now.getTime();
  const remMs = reminderDays() * DAY_MS;
  let changed = false;

  const kept = list.filter((l) => {
    const exp = new Date(l.expiresAt).getTime();
    if (!l.soldAt && exp <= nowMs) {
      changed = true;
      return false;
    }
    return true;
  });

  for (const l of kept) {
    if (l.soldAt) continue;
    const exp = new Date(l.expiresAt).getTime();
    if (exp > nowMs && exp - nowMs <= remMs && !l.reminderSentAt) {
      l.reminderSentAt = now.toISOString();
      changed = true;
    }
  }

  return { next: kept, changed };
}
