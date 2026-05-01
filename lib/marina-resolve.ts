import { MARINA_WORLD_CATALOG } from "@/lib/marina-catalog";
import { marinaRowToListing } from "@/lib/marina-map-db";
import type { MarinaListing } from "@/lib/marina-types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function resolveMarinaById(id: string): Promise<MarinaListing | undefined> {
  const trimmed = id.trim();
  if (!trimmed) return undefined;

  if (isSupabaseConfigured()) {
    try {
      const sb = supabaseAdmin();
      const { data, error } = await sb.from("marinas").select("*").eq("id", trimmed).maybeSingle();
      if (!error && data && typeof data === "object") {
        const m = marinaRowToListing(data as Record<string, unknown>);
        if (m) return m;
      }
    } catch {
      /* fall through */
    }
  }

  return MARINA_WORLD_CATALOG.find((m) => m.id === trimmed);
}
