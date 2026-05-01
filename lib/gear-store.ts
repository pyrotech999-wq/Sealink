import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { GearListing } from "@/lib/gear-types";
import { isGearCategoryId, isGearListingKind } from "@/lib/gear-types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as gearSupabase from "@/lib/gear-supabase";
import {
  applyPruneAndReminders,
  defaultExpiresAt,
  extendExpiresFromCurrent,
  daysUntilExpiry,
  isInReminderWindow,
} from "@/lib/gear-store-shared";

export { defaultExpiresAt, extendExpiresFromCurrent, daysUntilExpiry, isInReminderWindow };

const DATA_PATH = path.join(process.cwd(), "data", "gear-listings.json");

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

export function newListingId(): string {
  return randomUUID();
}

export async function loadGearListings(now = new Date()): Promise<GearListing[]> {
  if (isSupabaseConfigured()) {
    return gearSupabase.loadGearListings(now);
  }
  return enqueue(async () => {
    const raw = readRaw();
    const { next, changed } = applyPruneAndReminders(raw, now);
    if (changed) writeRaw(next);
    return next;
  });
}

export async function appendListing(listing: GearListing): Promise<void> {
  if (isSupabaseConfigured()) {
    return gearSupabase.appendListing(listing);
  }
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
  if (isSupabaseConfigured()) {
    return gearSupabase.updateListing(id, sellerUid, mutator);
  }
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

export async function deleteListing(id: string, sellerUid: string): Promise<{ ok: boolean; error?: string }> {
  if (isSupabaseConfigured()) {
    return gearSupabase.deleteListing(id, sellerUid);
  }
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
