import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type PayPalSubscriptionRow = {
  userUid: string;
  subscriptionId: string;
  status: string;
  plan: string | null;
  raw: unknown;
  updatedAt: string;
};

const DATA_PATH = path.join(process.cwd(), "data", "paypal-subscriptions.json");

type FileShape = Record<string, PayPalSubscriptionRow>;

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

/** Record or update a PayPal subscription tied to the signed-in user (by stable uid). */
export async function upsertPayPalSubscription(row: Omit<PayPalSubscriptionRow, "updatedAt">): Promise<void> {
  const updatedAt = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    const { error } = await sb.from("paypal_subscriptions").upsert(
      {
        user_uid: row.userUid,
        subscription_id: row.subscriptionId,
        status: row.status,
        plan: row.plan,
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

export async function getPayPalSubscriptionByUser(userUid: string): Promise<PayPalSubscriptionRow | null> {
  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("paypal_subscriptions")
      .select("*")
      .eq("user_uid", userUid)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as Record<string, unknown>;
    return {
      userUid: String(r.user_uid ?? ""),
      subscriptionId: String(r.subscription_id ?? ""),
      status: String(r.status ?? ""),
      plan: typeof r.plan === "string" ? r.plan : null,
      raw: r.raw,
      updatedAt: String(r.updated_at ?? ""),
    };
  }
  const store = readFileStore();
  const rows = Object.values(store).filter((x) => x.userUid === userUid);
  rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return rows[0] ?? null;
}
