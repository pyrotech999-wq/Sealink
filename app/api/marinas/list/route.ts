import { NextResponse } from "next/server";
import { listMarinasMerged } from "@/lib/marina-list-server";
import type { MarinaQueryParams } from "@/lib/marina-query";

export const runtime = "nodejs";

function parseNum(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const country = (url.searchParams.get("country") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();
  const boatLengthM = parseNum(url.searchParams.get("boatLengthM"));
  const userLat = parseNum(url.searchParams.get("lat"));
  const userLng = parseNum(url.searchParams.get("lng"));
  const radiusMi = parseNum(url.searchParams.get("radiusMi")) ?? 250;
  const limit = parseNum(url.searchParams.get("limit")) ?? 250;

  const p: MarinaQueryParams = {
    country: country || undefined,
    q: q || undefined,
    boatLengthM,
    userLat,
    userLng,
    radiusMi,
    limit,
  };

  try {
    const { marinas, source } = await listMarinasMerged(p);
    return NextResponse.json({ marinas, source, count: marinas.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "List failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
