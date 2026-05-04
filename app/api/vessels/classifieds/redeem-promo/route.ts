import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { redeemPromo } from "@/lib/vessel-freelisting-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code =
    typeof body === "object" && body !== null && "code" in body ? String((body as { code?: unknown }).code ?? "") : "";
  if (!code.trim()) return NextResponse.json({ error: "code required" }, { status: 400 });

  const r = await redeemPromo(u.uid, code);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true as const, slotsAdded: r.slotsAdded });
}
