import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DATA_PATH = path.join(process.cwd(), "data", "admin-grants.json");

type FileShape = { grants: Record<string, boolean> };

function readFileGrants(): Record<string, boolean> {
  try {
    if (!existsSync(DATA_PATH)) return {};
    const j = JSON.parse(readFileSync(DATA_PATH, "utf-8")) as unknown;
    if (!j || typeof j !== "object") return {};
    const g = (j as FileShape).grants;
    return g && typeof g === "object" ? g : {};
  } catch {
    return {};
  }
}

function writeFileGrants(grants: Record<string, boolean>): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify({ grants } satisfies FileShape, null, 2), "utf-8");
}

export async function getAdminGrantedFreeAccess(userUid: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("profiles")
      .select("admin_granted_free_access")
      .eq("user_uid", userUid)
      .maybeSingle();
    if (error || !data) return false;
    const v = (data as Record<string, unknown>).admin_granted_free_access;
    return v === true;
  }
  const g = readFileGrants();
  return g[userUid] === true;
}

export async function setAdminGrantedFreeAccess(userUid: string, granted: boolean): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    const { data: existing } = await sb.from("profiles").select("user_uid").eq("user_uid", userUid).maybeSingle();
    if (existing) {
      const { error } = await sb
        .from("profiles")
        .update({ admin_granted_free_access: granted, updated_at: now })
        .eq("user_uid", userUid);
      if (error) throw new Error(error.message);
      return;
    }
    const { error } = await sb.from("profiles").upsert(
      {
        user_uid: userUid,
        admin_granted_free_access: granted,
        updated_at: now,
      },
      { onConflict: "user_uid" },
    );
    if (error) throw new Error(error.message);
    return;
  }
  const grants = readFileGrants();
  if (granted) grants[userUid] = true;
  else delete grants[userUid];
  writeFileGrants(grants);
}
