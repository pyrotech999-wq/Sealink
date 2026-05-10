import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Minimal health probe: if this is fast but `/api/anchor/commands?role=monitor` is slow, suspect DB/command path. */
export function GET(): NextResponse {
  return NextResponse.json({ ok: true, ts: Date.now() }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
