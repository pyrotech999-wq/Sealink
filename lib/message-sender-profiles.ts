import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type SenderProfileFields = {
  senderDisplayName: string | null;
  senderBoatName: string | null;
};

/** Batch-load `profiles.full_name` / `boat_name` for message senders (Supabase only). */
export async function attachSenderProfilesToMessages<T extends { senderUid: string }>(
  messages: T[],
): Promise<Array<T & SenderProfileFields>> {
  if (!isSupabaseConfigured() || messages.length === 0) {
    return messages.map((m) => ({ ...m, senderDisplayName: null, senderBoatName: null }));
  }
  const uids = [...new Set(messages.map((m) => m.senderUid).filter(Boolean))];
  if (uids.length === 0) {
    return messages.map((m) => ({ ...m, senderDisplayName: null, senderBoatName: null }));
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("profiles").select("user_uid, full_name, boat_name").in("user_uid", uids);
  if (error || !Array.isArray(data)) {
    return messages.map((m) => ({ ...m, senderDisplayName: null, senderBoatName: null }));
  }
  const map = new Map<string, { fn: string; bn: string }>();
  for (const row of data as { user_uid: string; full_name: string | null; boat_name: string | null }[]) {
    if (typeof row.user_uid !== "string") continue;
    map.set(row.user_uid, {
      fn: typeof row.full_name === "string" ? row.full_name.trim() : "",
      bn: typeof row.boat_name === "string" ? row.boat_name.trim() : "",
    });
  }
  return messages.map((m) => {
    const p = map.get(m.senderUid);
    return {
      ...m,
      senderDisplayName: p?.fn ? p.fn : null,
      senderBoatName: p?.bn ? p.bn : null,
    };
  });
}
