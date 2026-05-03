import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type StripeSubscriptionRow = {
  userUid: string;
  stripeCustomerId: string | null;
  subscriptionId: string;
  status: string;
  priceId: string | null;
  raw: unknown;
  updatedAt: string;
};

const DATA_PATH = path.join(process.cwd(), "data", "stripe-subscriptions.json");

type FileShape = Record<string, StripeSubscriptionRow>;

function readFileStore(): FileShape {
  try {
    if (!existsSync(DATA_PATH)) return {};
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as FileShape;
  } catch {
    return {};
  }
}

function writeFileStore(store: FileShape): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export async function upsertStripeSubscription(
  row: Omit<StripeSubscriptionRow, "updatedAt">,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    const { error } = await sb.from("stripe_subscriptions").upsert(
      {
        user_uid: row.userUid,
        stripe_customer_id: row.stripeCustomerId,
        subscription_id: row.subscriptionId,
        status: row.status,
        price_id: row.priceId,
        raw: row.raw as object | null,
        updated_at: updatedAt,
      },
      { onConflict: "subscription_id" },
    );
    if (error) throw new Error(error.message);
    return;
  }
  const store = readFileStore();
  store[row.subscriptionId] = { ...row, updatedAt };
  writeFileStore(store);
}

export async function getStripeSubscriptionByUser(userUid: string): Promise<StripeSubscriptionRow | null> {
  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("stripe_subscriptions")
      .select("*")
      .eq("user_uid", userUid)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as Record<string, unknown>;
    return {
      userUid: String(r.user_uid ?? ""),
      stripeCustomerId: typeof r.stripe_customer_id === "string" ? r.stripe_customer_id : null,
      subscriptionId: String(r.subscription_id ?? ""),
      status: String(r.status ?? ""),
      priceId: typeof r.price_id === "string" ? r.price_id : null,
      raw: r.raw,
      updatedAt: String(r.updated_at ?? ""),
    };
  }
  const store = readFileStore();
  const rows = Object.values(store).filter((x) => x.userUid === userUid);
  rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return rows[0] ?? null;
}
