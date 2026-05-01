import { NextResponse } from "next/server";
import { listMarinaCountriesMerged } from "@/lib/marina-list-server";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const countries = await listMarinaCountriesMerged();
    return NextResponse.json({ countries });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
