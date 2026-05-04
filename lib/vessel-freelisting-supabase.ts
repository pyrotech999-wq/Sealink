import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getSlotBalanceSupabase(userUid: string): Promise<number> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("vessel_listing_slot_balances").select("balance").eq("user_uid", userUid).maybeSingle();
  if (error) throw new Error(error.message);
  const n = data && typeof (data as { balance?: unknown }).balance === "number" ? (data as { balance: number }).balance : 0;
  return Math.max(0, n);
}

export async function consumeOneSlotSupabase(userUid: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("consume_vessel_listing_slot", { p_user_uid: userUid });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function redeemPromoSupabase(codeNorm: string, userUid: string): Promise<{ ok: true; slotsAdded: number } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("redeem_vessel_promo", { p_code_norm: codeNorm, p_user_uid: userUid });
  if (error) return { ok: false, error: error.message };
  const j = data as { ok?: boolean; error?: string; slotsAdded?: number } | null;
  if (!j || typeof j !== "object") return { ok: false, error: "Unexpected response" };
  if (j.ok === true && typeof j.slotsAdded === "number") return { ok: true, slotsAdded: j.slotsAdded };
  return { ok: false, error: typeof j.error === "string" ? j.error : "Could not redeem code" };
}

export type PromoCodeRow = {
  id: string;
  codeNorm: string;
  label: string | null;
  maxUses: number;
  uses: number;
  slotsPerRedeem: number;
  expiresAt: string | null;
  createdAt: string;
};

export async function listPromoCodesSupabase(): Promise<PromoCodeRow[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("vessel_promo_codes")
    .select("id, code_norm, label, max_uses, uses, slots_per_redeem, expires_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: String(x.id ?? ""),
      codeNorm: String(x.code_norm ?? ""),
      label: typeof x.label === "string" ? x.label : null,
      maxUses: typeof x.max_uses === "number" ? x.max_uses : 0,
      uses: typeof x.uses === "number" ? x.uses : 0,
      slotsPerRedeem: typeof x.slots_per_redeem === "number" ? x.slots_per_redeem : 1,
      expiresAt: typeof x.expires_at === "string" ? x.expires_at : null,
      createdAt: typeof x.created_at === "string" ? x.created_at : "",
    };
  });
}

export async function insertPromoCodeSupabase(input: {
  codeNorm: string;
  label: string | null;
  maxUses: number;
  slotsPerRedeem: number;
  expiresAt: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("vessel_promo_codes")
    .insert({
      code_norm: input.codeNorm,
      label: input.label,
      max_uses: input.maxUses,
      uses: 0,
      slots_per_redeem: input.slotsPerRedeem,
      expires_at: input.expiresAt,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That code already exists" };
    return { ok: false, error: error.message };
  }
  const id = data && typeof (data as { id?: unknown }).id === "string" ? (data as { id: string }).id : "";
  if (!id) return { ok: false, error: "Insert failed" };
  return { ok: true, id };
}
