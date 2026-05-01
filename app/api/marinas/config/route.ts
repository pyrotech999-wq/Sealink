import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";

/** Public: whether the server has Supabase env for marina (and other) DB features — no secrets returned. */
export async function GET(): Promise<Response> {
  return NextResponse.json({ supabaseConfigured: isSupabaseConfigured() });
}
