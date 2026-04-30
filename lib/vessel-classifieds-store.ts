import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { VesselClassifiedListing, VesselListingStatus } from "@/lib/vessel-classifieds-types";
import { isVesselCategoryId } from "@/lib/vessel-classifieds-types";

const DATA_PATH = path.join(process.cwd(), "data", "vessel-classifieds.json");

const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_DAYS = 180; // ~6 months

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function readRaw(): VesselClassifiedListing[] {
  try {
    if (!existsSync(DATA_PATH)) return [];
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((r) => normalise(r))
      .filter((r): r is VesselClassifiedListing => r != null);
  } catch {
    return [];
  }
}

function writeRaw(list: VesselClassifiedListing[]): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(list, null, 2), "utf-8");
}

function defaultExpiresAt(created: Date): string {
  return new Date(created.getTime() + TTL_DAYS * DAY_MS).toISOString();
}

function normalise(row: unknown): VesselClassifiedListing | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Partial<VesselClassifiedListing> & { [k: string]: unknown };
  if (typeof r.id !== "string" || typeof r.ownerUid !== "string") return null;
  if (typeof r.createdAt !== "string" || typeof r.expiresAt !== "string") return null;
  if (typeof r.categoryId !== "string" || !isVesselCategoryId(r.categoryId)) return null;
  if (typeof r.title !== "string" || typeof r.description !== "string") return null;

  const status = (r.status as VesselListingStatus) ?? "draft";
  const imageUrls = Array.isArray(r.imageUrls) ? r.imageUrls.filter((u) => typeof u === "string").slice(0, 3) : [];

  return {
    id: r.id,
    ownerUid: r.ownerUid,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    removedAt: typeof r.removedAt === "string" ? r.removedAt : null,
    status: status === "active" || status === "expired" || status === "removed" ? status : "draft",
    paymentStatus: r.paymentStatus === "paid" || r.paymentStatus === "pending" ? r.paymentStatus : "unpaid",
    paymentProvider: r.paymentProvider === "paypal" ? r.paymentProvider : null,
    paymentRef: typeof r.paymentRef === "string" ? r.paymentRef : null,
    categoryId: r.categoryId,
    title: r.title,
    description: r.description,
    priceGbp: typeof r.priceGbp === "number" && Number.isFinite(r.priceGbp) ? r.priceGbp : null,
    locationLabel: typeof r.locationLabel === "string" ? r.locationLabel : null,
    year: typeof r.year === "number" && Number.isFinite(r.year) ? r.year : null,
    lengthFt: typeof r.lengthFt === "number" && Number.isFinite(r.lengthFt) ? r.lengthFt : null,
    makeModel: typeof r.makeModel === "string" ? r.makeModel : null,
    imageUrls,
  };
}

function applyExpiry(list: VesselClassifiedListing[], now: Date): { next: VesselClassifiedListing[]; changed: boolean } {
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

export function newVesselListingId(): string {
  return randomUUID();
}

export async function loadVesselClassifieds(now = new Date()): Promise<VesselClassifiedListing[]> {
  return enqueue(async () => {
    const raw = readRaw();
    const { next, changed } = applyExpiry(raw, now);
    if (changed) writeRaw(next);
    return next;
  });
}

export async function appendVesselListing(listing: VesselClassifiedListing): Promise<void> {
  return enqueue(async () => {
    const raw = readRaw();
    raw.push(listing);
    const { next } = applyExpiry(raw, new Date());
    writeRaw(next);
  });
}

export async function updateVesselListing(
  id: string,
  ownerUid: string,
  mutator: (l: VesselClassifiedListing) => VesselClassifiedListing | null,
): Promise<{ ok: boolean; error?: string }> {
  return enqueue(async () => {
    const raw = readRaw();
    const { next: list } = applyExpiry(raw, new Date());
    const idx = list.findIndex((l) => l.id === id);
    if (idx < 0) return { ok: false, error: "Not found" };
    const row = list[idx];
    if (!row || row.ownerUid !== ownerUid) return { ok: false, error: "Not allowed" };
    const updated = mutator(row);
    if (updated === null) return { ok: false, error: "Update rejected" };
    const merged = [...list.slice(0, idx), updated, ...list.slice(idx + 1)];
    const { next } = applyExpiry(merged, new Date());
    writeRaw(next);
    return { ok: true };
  });
}

export async function adminUpdateVesselListing(
  id: string,
  mutator: (l: VesselClassifiedListing) => VesselClassifiedListing | null,
): Promise<{ ok: boolean; error?: string; ownerUid?: string }> {
  return enqueue(async () => {
    const raw = readRaw();
    const { next: list } = applyExpiry(raw, new Date());
    const idx = list.findIndex((l) => l.id === id);
    if (idx < 0) return { ok: false, error: "Not found" };
    const row = list[idx];
    if (!row) return { ok: false, error: "Not found" };
    const updated = mutator(row);
    if (updated === null) return { ok: false, error: "Update rejected" };
    const merged = [...list.slice(0, idx), updated, ...list.slice(idx + 1)];
    const { next } = applyExpiry(merged, new Date());
    writeRaw(next);
    return { ok: true, ownerUid: row.ownerUid };
  });
}

export function buildDraftListing(ownerUid: string): VesselClassifiedListing {
  const now = new Date();
  return {
    id: newVesselListingId(),
    ownerUid,
    createdAt: now.toISOString(),
    expiresAt: defaultExpiresAt(now),
    removedAt: null,
    status: "draft",
    paymentStatus: "unpaid",
    paymentProvider: null,
    paymentRef: null,
    categoryId: "sailing_yachts",
    title: "",
    description: "",
    priceGbp: null,
    locationLabel: null,
    year: null,
    lengthFt: null,
    makeModel: null,
    imageUrls: [],
  };
}

