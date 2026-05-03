import { normaliseEmail } from "@/lib/email-normalise";
import { normalisePhone } from "@/lib/phone-normalise";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { OPERATOR_PUBLIC_EMAIL } from "@/lib/operator-public-email";

/** Primary owner: full admin UI + complimentary subscription (email or profile phone). */
export const RESERVED_OWNER_EMAIL = OPERATOR_PUBLIC_EMAIL;

export function isReservedOwnerEmail(email: string): boolean {
  return normaliseEmail(email) === normaliseEmail(RESERVED_OWNER_EMAIL);
}

/** UK mobile 07828 584375 / 7828584375 / +447828584375 — same number. */
export function isReservedOwnerPhone(phoneRaw: string | null | undefined): boolean {
  if (!phoneRaw?.trim()) return false;
  let digits = normalisePhone(phoneRaw).replace(/\D/g, "");
  if (digits.startsWith("44")) digits = `0${digits.slice(2)}`;
  digits = digits.replace(/^0+/, "");
  return digits === "7828584375";
}

async function getProfilePhoneForUid(userUid: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  const { data } = await sb.from("profiles").select("phone").eq("user_uid", userUid).maybeSingle();
  const p = data as { phone?: string } | null;
  return typeof p?.phone === "string" ? p.phone : null;
}

/** Reserved owner: primary email, or profile phone matching the known mobile. */
export async function isReservedOwner(email: string, userUid: string): Promise<boolean> {
  if (isReservedOwnerEmail(email)) return true;
  const phone = await getProfilePhoneForUid(userUid);
  return isReservedOwnerPhone(phone);
}
