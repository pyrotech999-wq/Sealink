import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { displayNameFromEmail } from "@/lib/chat-display-fallback";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Signed-in users only: resolve display fields for another user (e.g. broadcast author). */
export async function GET(req: Request) {
  try {
    await requireAuthUser();
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  const uid = new URL(req.url).searchParams.get("uid")?.trim();
  if (!uid) {
    return NextResponse.json({ error: "uid required" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ fullName: null, boatName: null });
  }

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("profiles").select("full_name, boat_name").eq("user_uid", uid).maybeSingle();
    const row = !error ? (data as { full_name?: string | null; boat_name?: string | null } | null) : null;
    let fullName = typeof row?.full_name === "string" ? row.full_name.trim() : "";
    let boatName = typeof row?.boat_name === "string" ? row.boat_name.trim() : "";

    if (!fullName || !boatName) {
      const { data: ifm } = await sb.from("ifm_presence").select("full_name, boat_name").eq("uid", uid).maybeSingle();
      const ir = ifm as { full_name?: string | null; boat_name?: string | null } | null;
      if (!fullName && typeof ir?.full_name === "string" && ir.full_name.trim()) fullName = ir.full_name.trim();
      if (!boatName && typeof ir?.boat_name === "string" && ir.boat_name.trim()) boatName = ir.boat_name.trim();
    }

    if (!fullName) {
      const { data: acct } = await sb.from("user_accounts").select("email").eq("uid", uid).maybeSingle();
      const em = acct as { email?: string | null } | null;
      if (typeof em?.email === "string" && em.email) {
        const fromMail = displayNameFromEmail(em.email);
        if (fromMail) fullName = fromMail;
      }
    }

    return NextResponse.json({
      fullName: fullName || null,
      boatName: boatName || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load profile";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
