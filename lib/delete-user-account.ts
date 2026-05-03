import { isReservedOwner } from "@/lib/reserved-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { deleteUserByEmailFromLocalStore } from "@/lib/users-store";

const UPLOAD_BUCKET = "site-uploads";

export type DeleteUserAccountResult = { ok: true } | { ok: false; error: string };

/**
 * Permanently removes the signed-in user’s account and related rows (best-effort).
 * Blocks the reserved primary-owner account.
 */
export async function deleteUserAccount(uid: string, email: string): Promise<DeleteUserAccountResult> {
  if (await isReservedOwner(email, uid)) {
    return { ok: false, error: "This account cannot be deleted from the app." };
  }

  if (!isSupabaseConfigured()) {
    const removed = await deleteUserByEmailFromLocalStore(email);
    return removed ? { ok: true } : { ok: false, error: "No local account record found." };
  }

  const sb = supabaseAdmin();

  async function tryDelete(from: string, filter: { col: string; val: string }): Promise<void> {
    const { error } = await sb.from(from).delete().eq(filter.col, filter.val);
    if (error && !/relation|does not exist|schema cache/i.test(error.message)) {
      console.warn(`[delete-user-account] ${from}:`, error.message);
    }
  }

  await tryDelete("stripe_subscriptions", { col: "user_uid", val: uid });
  await tryDelete("paypal_subscriptions", { col: "user_uid", val: uid });
  await tryDelete("broadcast_reply_seen", { col: "viewer_uid", val: uid });
  await tryDelete("broadcast_reply_messages", { col: "sender_uid", val: uid });
  await tryDelete("map_broadcasts", { col: "author_uid", val: uid });
  await tryDelete("ifm_friends", { col: "user_uid", val: uid });
  await tryDelete("ifm_presence", { col: "uid", val: uid });
  await tryDelete("vessel_listings", { col: "owner_uid", val: uid });
  await tryDelete("gear_listings", { col: "seller_uid", val: uid });

  const { error: vicErr } = await sb.from("vicinity_dm_threads").delete().or(`user_a.eq.${uid},user_b.eq.${uid}`);
  if (vicErr && !/relation|does not exist|schema cache/i.test(vicErr.message)) {
    console.warn("[delete-user-account] vicinity_dm_threads:", vicErr.message);
  }

  try {
    const prefix = `avatars/${uid}`;
    const { data: listed } = await sb.storage.from(UPLOAD_BUCKET).list(prefix);
    if (listed?.length) {
      const paths = listed.map((f) => `${prefix}/${f.name}`);
      await sb.storage.from(UPLOAD_BUCKET).remove(paths);
    }
  } catch (e) {
    console.warn("[delete-user-account] storage cleanup", e);
  }

  const { error } = await sb.from("user_accounts").delete().eq("uid", uid);
  if (error) {
    console.error("[delete-user-account] user_accounts", error);
    return { ok: false, error: "Could not remove account. Try again or email support." };
  }

  return { ok: true };
}
