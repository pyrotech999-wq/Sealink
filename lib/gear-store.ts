import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { GearListing } from "@/lib/gear-types";
import { GEAR_LISTING_TTL_DAYS, GEAR_REMINDER_DAYS_BEFORE } from "@/lib/gear-constants";

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
    return parsed as GearListing[];
  } catch {
    return [];
  }
}

function writeRaw(list: GearListing[]): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(list, null, 2), "utf-8");
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Drop expired (unsold) listings; mark reminderSentAt when entering reminder window. */
function pruneAndTouchReminders(list: GearListing[], now: Date): GearListing[] {
  const nowMs = now.getTime();
  const remMs = reminderDays() * DAY_MS;
  let changed = false;
  const kept: GearListing[] = [];

  for (const l of list) {
    const exp = new Date(l.expiresAt).getTime();
    if (!l.soldAt && exp <= nowMs) {
      changed = true;
      continue;
    }
    kept.push(l);
  }

  for (const l of kept) {
    if (l.soldAt) continue;
    const exp = new Date(l.expiresAt).getTime();
    if (exp > nowMs && exp - nowMs <= remMs && !l.reminderSentAt) {
      l.reminderSentAt = now.toISOString();
      changed = true;
    }
  }

  if (changed) writeRaw(kept);
  return kept;
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
    return pruneAndTouchReminders(raw, now);
  });
}

export async function saveGearListings(list: GearListing[]): Promise<void> {
  return enqueue(async () => {
    writeRaw(list);
  });
}

export async function appendListing(listing: GearListing): Promise<void> {
  return enqueue(async () => {
    const list = readRaw();
    list.push(listing);
    writeRaw(pruneAndTouchReminders(list, new Date()));
  });
}

export async function updateListing(
  id: string,
  sellerUid: string,
  mutator: (l: GearListing) => GearListing | null,
): Promise<{ ok: boolean; error?: string }> {
  return enqueue(async () => {
    let list = readRaw();
    list = pruneAndTouchReminders(list, new Date());
    const idx = list.findIndex((l) => l.id === id);
    if (idx < 0) return { ok: false, error: "Listing not found" };
    const row = list[idx];
    if (!row || row.sellerUid !== sellerUid) return { ok: false, error: "Not allowed" };
    const next = mutator(row);
    if (next === null) return { ok: false, error: "Update rejected" };
    list[idx] = next;
    writeRaw(list);
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
