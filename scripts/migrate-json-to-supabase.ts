/**
 * One-off: copy local `data/*.json` into Supabase (same tables as 001_initial.sql).
 *
 * Prerequisites:
 *   - Run supabase/migrations/001_initial.sql on your project
 *   - Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage:
 *   npm run migrate:supabase           # migrate
 *   npm run migrate:supabase:dry       # print counts only
 *
 * Safe to re-run: uses upserts where possible. account_devices for a user is replaced
 * with the JSON snapshot (delete + insert) to match file-store semantics.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import path from "path";

config({ path: path.join(process.cwd(), ".env.local") });
config({ path: path.join(process.cwd(), ".env") });

const DRY = process.argv.includes("--dry-run") || process.argv.includes("--dry");

type UserRowJson = {
  uid: string;
  email: string;
  password: { saltHex: string; hashHex: string };
  createdAt: string;
  updatedAt: string;
};

type AccountDeviceJson = {
  deviceId: string;
  name: string;
  activatedAt: string;
  lastSeenAt: string;
  active: boolean;
};

type VesselJson = {
  id: string;
  ownerUid: string;
  createdAt: string;
  expiresAt: string;
  removedAt: string | null;
  status: string;
  paymentStatus: string;
  paymentProvider: string | null;
  paymentRef: string | null;
  categoryId: string;
  title: string;
  description: string;
  priceGbp: number | null;
  locationLabel: string | null;
  year: number | null;
  lengthFt: number | null;
  makeModel: string | null;
  imageUrls: string[];
};

type GearJson = {
  id: string;
  sellerUid: string;
  kind: string;
  title: string;
  description: string;
  categoryId: string;
  priceLabel: string | null;
  imageUrls: string[];
  createdAt: string;
  expiresAt: string;
  soldAt: string | null;
  reminderSentAt: string | null;
};

type PayPalRowJson = {
  userUid: string;
  subscriptionId: string;
  status: string;
  plan: string | null;
  raw: unknown;
  updatedAt: string;
};

function readJson<T>(file: string): T | null {
  const p = path.join(process.cwd(), "data", file);
  if (!existsSync(p)) {
    console.warn(`[skip] ${file} not found`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  } catch (e) {
    console.error(`[error] ${file}:`, e);
    return null;
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  const usersRaw = readJson<Record<string, UserRowJson>>("users.json");
  const users = usersRaw ? Object.values(usersRaw) : [];
  const devicesRaw = readJson<Record<string, AccountDeviceJson[]>>("account-devices.json");
  const vesselsRaw = readJson<VesselJson[]>("vessel-classifieds.json");
  const vessels = Array.isArray(vesselsRaw) ? vesselsRaw : [];
  const gearRaw = readJson<GearJson[]>("gear-listings.json");
  const gear = Array.isArray(gearRaw) ? gearRaw : [];
  const paypalRaw = readJson<Record<string, PayPalRowJson>>("paypal-subscriptions.json");
  const paypalRows = paypalRaw ? Object.values(paypalRaw) : [];

  console.log("SeaLink → Supabase migration");
  console.log({
    dryRun: DRY,
    users: users.length,
    deviceUids: devicesRaw ? Object.keys(devicesRaw).length : 0,
    vessels: vessels.length,
    gear: gear.length,
    paypalSubscriptions: paypalRows.length,
  });

  if (DRY) {
    console.log("Dry run complete.");
    return;
  }

  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local).");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const userUids = new Set(users.map((u) => u.uid));

  // 1) Users
  for (const batch of chunk(users, 50)) {
    const rows = batch.map((u) => ({
      uid: u.uid,
      email: u.email,
      password_hash: u.password,
      created_at: u.createdAt,
      updated_at: u.updatedAt,
    }));
    const { error } = await sb.from("user_accounts").upsert(rows, { onConflict: "email" });
    if (error) {
      console.error("user_accounts upsert failed:", error.message);
      process.exit(1);
    }
  }
  console.log(`[ok] user_accounts: ${users.length}`);

  // 2) Account devices (replace per user to match JSON)
  if (devicesRaw) {
    for (const [userUid, list] of Object.entries(devicesRaw)) {
      if (!Array.isArray(list)) continue;
      if (!userUids.has(userUid)) {
        console.warn(`[warn] account_devices: skip unknown user uid (not in users.json): ${userUid}`);
        continue;
      }
      await sb.from("account_devices").delete().eq("user_uid", userUid);
      if (list.length === 0) continue;
      const rows = list.map((d) => ({
        user_uid: userUid,
        device_id: d.deviceId,
        name: d.name ?? "",
        activated_at: d.activatedAt,
        last_seen_at: d.lastSeenAt,
        active: Boolean(d.active),
      }));
      const { error } = await sb.from("account_devices").insert(rows);
      if (error) {
        console.error(`account_devices insert failed for ${userUid}:`, error.message);
        process.exit(1);
      }
    }
    console.log(`[ok] account_devices: ${Object.keys(devicesRaw).length} user keys`);
  }

  // 3) Vessel listings
  for (const batch of chunk(vessels, 50)) {
    const rows = batch.map((l) => ({
      id: l.id,
      owner_uid: l.ownerUid,
      created_at: l.createdAt,
      expires_at: l.expiresAt,
      removed_at: l.removedAt,
      status: l.status,
      payment_status: l.paymentStatus,
      payment_provider: l.paymentProvider,
      payment_ref: l.paymentRef,
      category_id: l.categoryId,
      title: l.title,
      description: l.description,
      price_gbp: l.priceGbp,
      location_label: l.locationLabel,
      year: l.year,
      length_ft: l.lengthFt,
      make_model: l.makeModel,
      image_urls: Array.isArray(l.imageUrls) ? l.imageUrls : [],
    }));
    const { error } = await sb.from("vessel_listings").upsert(rows, { onConflict: "id" });
    if (error) {
      console.error("vessel_listings upsert failed:", error.message);
      process.exit(1);
    }
  }
  console.log(`[ok] vessel_listings: ${vessels.length}`);

  // 4) Gear listings
  for (const batch of chunk(gear, 50)) {
    const rows = batch.map((l) => ({
      id: l.id,
      seller_uid: l.sellerUid,
      kind: l.kind,
      title: l.title,
      description: l.description,
      category_id: l.categoryId,
      price_label: l.priceLabel,
      image_urls: Array.isArray(l.imageUrls) ? l.imageUrls : [],
      created_at: l.createdAt,
      expires_at: l.expiresAt,
      sold_at: l.soldAt,
      reminder_sent_at: l.reminderSentAt,
    }));
    const { error } = await sb.from("gear_listings").upsert(rows, { onConflict: "id" });
    if (error) {
      console.error("gear_listings upsert failed:", error.message);
      process.exit(1);
    }
  }
  console.log(`[ok] gear_listings: ${gear.length}`);

  // 5) PayPal subscriptions
  for (const batch of chunk(paypalRows, 50)) {
    const rows = batch.map((p) => ({
      user_uid: p.userUid,
      subscription_id: p.subscriptionId,
      status: p.status,
      plan: p.plan,
      raw: p.raw as object | null,
      updated_at: p.updatedAt,
    }));
    const { error } = await sb.from("paypal_subscriptions").upsert(rows, { onConflict: "subscription_id" });
    if (error) {
      console.error("paypal_subscriptions upsert failed:", error.message);
      process.exit(1);
    }
  }
  console.log(`[ok] paypal_subscriptions: ${paypalRows.length}`);

  console.log("\nDone. Profiles were not in JSON — they stay empty until users sign in / update. Local /uploads files are not copied to Storage; image URLs in rows still point at old paths if you used disk uploads.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
