import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
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
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const row = data as { full_name?: string | null; boat_name?: string | null } | null;
    const fullName = typeof row?.full_name === "string" ? row.full_name.trim() : "";
    const boatName = typeof row?.boat_name === "string" ? row.boat_name.trim() : "";
    return NextResponse.json({
      fullName: fullName || null,
      boatName: boatName || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load profile";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
