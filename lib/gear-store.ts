import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { GearListing } from "@/lib/gear-types";
import { GEAR_LISTING_TTL_DAYS, GEAR_REMINDER_DAYS_BEFORE } from "@/lib/gear-constants";
import { isGearCategoryId, isGearListingKind } from "@/lib/gear-types";

const DATA_PATH = path.join(process.cwd(), "data", "gear-listings.json");

function ttlDays(): number {
  const n = Number(process.env.GEAR_LISTING_TTL_DAYS);
  return Number.isFinite(n) && n > 0 ? n : GEAR_LISTING_TTL_DAYS;
}

function reminderDays(): number {
  const n = Number(process.env.GEAR_REMINDER_DAYS_BEFORE);
  return Number.isFinite(n) && n > 0 ? n : GEAR_REMINDER_DAYS_BEFORE;
}

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function readRaw(): GearListing[] {
  try {
    if (!existsSync(DATA_PATH)) return [];
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => normaliseListing(row))
      .filter((row): row is GearListing => row != null);
  } catch {
    return [];
  }
}

function writeRaw(list: GearListing[]): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(list, null, 2), "utf-8");
}

const DAY_MS = 24 * 60 * 60 * 1000;

function normaliseListing(row: unknown): GearListing | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Partial<GearListing> & { [k: string]: unknown };

  if (typeof r.id !== "string" || typeof r.sellerUid !== "string") return null;
  if (typeof r.title !== "string" || typeof r.description !== "string") return null;
  if (typeof r.categoryId !== "string" || !isGearCategoryId(r.categoryId)) return null;
  if (typeof r.createdAt !== "string" || typeof r.expiresAt !== "string") return null;

  const kind = typeof r.kind === "string" && isGearListingKind(r.kind) ? r.kind : "sale";

  const imageUrls =
    Array.isArray(r.imageUrls) ? r.imageUrls.filter((u) => typeof u === "string").slice(0, 3) : [];

  return {
    id: r.id,
    sellerUid: r.sellerUid,
    kind,
    title: r.title,
    description: r.description,
    categoryId: r.categoryId,
    priceLabel: typeof r.priceLabel === "string" ? r.priceLabel : null,
    imageUrls,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    soldAt: typeof r.soldAt === "string" ? r.soldAt : null,
    reminderSentAt: typeof r.reminderSentAt === "string" ? r.reminderSentAt : null,
  };
}

function applyPruneAndReminders(list: GearListing[], now: Date): { next: GearListing[]; changed: boolean } {
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

export function newListingId(): string {
  return randomUUID();
}

export function defaultExpiresAt(createdAt: Date): string {
  return new Date(createdAt.getTime() + ttlDays() * DAY_MS).toISOString();
}

export async function loadGearListings(now = new Date()): Promise<GearListing[]> {
  return enqueue(async () => {
    const raw = readRaw();
    const { next, changed } = applyPruneAndReminders(raw, now);
    if (changed) writeRaw(next);
    return next;
  });
}

export async function appendListing(listing: GearListing): Promise<void> {
  return enqueue(async () => {
    const raw = readRaw();
    raw.push(listing);
    const { next } = applyPruneAndReminders(raw, new Date());
    writeRaw(next);
  });
}

export async function updateListing(
  id: string,
  sellerUid: string,
  mutator: (l: GearListing) => GearListing | null,
): Promise<{ ok: boolean; error?: string }> {
  return enqueue(async () => {
    const raw = readRaw();
    const { next: list } = applyPruneAndReminders(raw, new Date());
    const idx = list.findIndex((l) => l.id === id);
    if (idx < 0) return { ok: false, error: "Listing not found" };
    const row = list[idx];
    if (!row || row.sellerUid !== sellerUid) return { ok: false, error: "Not allowed" };
    const updated = mutator(row);
    if (updated === null) return { ok: false, error: "Update rejected" };
    const merged = [...list.slice(0, idx), updated, ...list.slice(idx + 1)];
    const { next } = applyPruneAndReminders(merged, new Date());
    writeRaw(next);
    return { ok: true };
  });
}

export async function deleteListing(
  id: string,
  sellerUid: string,
): Promise<{ ok: boolean; error?: string }> {
  return enqueue(async () => {
    const raw = readRaw();
    const { next: list } = applyPruneAndReminders(raw, new Date());
    const idx = list.findIndex((l) => l.id === id);
    if (idx < 0) return { ok: false, error: "Listing not found" };
    const row = list[idx];
    if (!row || row.sellerUid !== sellerUid) return { ok: false, error: "Not allowed" };
    const merged = [...list.slice(0, idx), ...list.slice(idx + 1)];
    const { next } = applyPruneAndReminders(merged, new Date());
    writeRaw(next);
    return { ok: true };
  });
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

/** Add another full listing period onto the current expiry instant. */
export function extendExpiresFromCurrent(expiresAtIso: string): string {
  return new Date(new Date(expiresAtIso).getTime() + ttlDays() * DAY_MS).toISOString();
}
