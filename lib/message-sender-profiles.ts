import { displayNameFromEmail } from "@/lib/chat-display-fallback";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type SenderProfileFields = {
  senderDisplayName: string | null;
  senderBoatName: string | null;
};

type NameBoat = { fn: string; bn: string };

/** Batch-load display names: `profiles` first, then `ifm_presence`, then email local-part from `user_accounts`. */
export async function attachSenderProfilesToMessages<T extends { senderUid: string }>(
  messages: T[],
): Promise<Array<T & SenderProfileFields>> {
  const fallback = (): Array<T & SenderProfileFields> =>
    messages.map((m) => ({ ...m, senderDisplayName: null, senderBoatName: null }));

  if (!isSupabaseConfigured() || messages.length === 0) {
    return fallback();
  }
  const uids = [...new Set(messages.map((m) => m.senderUid).filter(Boolean))];
  if (uids.length === 0) {
    return fallback();
  }
  try {
    const sb = supabaseAdmin();
    const map = new Map<string, NameBoat>();

    const { data: profRows, error: profErr } = await sb
      .from("profiles")
      .select("user_uid, full_name, boat_name")
      .in("user_uid", uids);
    if (!profErr && Array.isArray(profRows)) {
      for (const row of profRows as { user_uid: string; full_name: string | null; boat_name: string | null }[]) {
        if (typeof row.user_uid !== "string") continue;
        map.set(row.user_uid, {
          fn: typeof row.full_name === "string" ? row.full_name.trim() : "",
          bn: typeof row.boat_name === "string" ? row.boat_name.trim() : "",
        });
      }
    }

    const needIfm = uids.filter((uid) => {
      const p = map.get(uid);
      return !p?.fn || !p?.bn;
    });
    if (needIfm.length > 0) {
      const { data: ifmRows } = await sb.from("ifm_presence").select("uid, full_name, boat_name").in("uid", needIfm);
      if (Array.isArray(ifmRows)) {
        for (const row of ifmRows as { uid: string; full_name?: string | null; boat_name?: string | null }[]) {
          if (typeof row.uid !== "string") continue;
          const fn = typeof row.full_name === "string" ? row.full_name.trim() : "";
          const bn = typeof row.boat_name === "string" ? row.boat_name.trim() : "";
          const cur = map.get(row.uid) ?? { fn: "", bn: "" };
          map.set(row.uid, {
            fn: cur.fn || fn,
            bn: cur.bn || bn,
          });
        }
      }
    }

    const needEmail = uids.filter((uid) => !(map.get(uid)?.fn));
    if (needEmail.length > 0) {
      const { data: acctRows } = await sb.from("user_accounts").select("uid, email").in("uid", needEmail);
      if (Array.isArray(acctRows)) {
        for (const row of acctRows as { uid: string; email?: string | null }[]) {
          if (typeof row.uid !== "string") continue;
          const fromMail = typeof row.email === "string" ? displayNameFromEmail(row.email) : null;
          if (!fromMail) continue;
          const cur = map.get(row.uid) ?? { fn: "", bn: "" };
          map.set(row.uid, { fn: cur.fn || fromMail, bn: cur.bn });
        }
      }
    }

    return messages.map((m) => {
      const p = map.get(m.senderUid);
      return {
        ...m,
        senderDisplayName: p?.fn ? p.fn : null,
        senderBoatName: p?.bn ? p.bn : null,
      };
    });
  } catch {
    return fallback();
  }
}
