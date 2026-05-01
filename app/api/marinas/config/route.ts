import { NextResponse } from "next/server";
import { marinasTableRowCount } from "@/lib/marina-list-server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: Supabase env + optional `marinas` row count (no secrets). */
export async function GET(): Promise<Response> {
  const supabaseConfigured = isSupabaseConfigured();
  const raw = supabaseConfigured ? await marinasTableRowCount() : null;
  // `JSON.stringify` omits `undefined`; always send a number or null so clients never see a one-key body.
  const marinasRowCount = raw != null && Number.isFinite(raw) ? raw : null;

  return NextResponse.json(
    { supabaseConfigured, marinasRowCount },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
