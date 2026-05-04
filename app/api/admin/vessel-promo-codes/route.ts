import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { adminCreatePromoCode, adminListPromoCodes } from "@/lib/vessel-freelisting-store";

export const runtime = "nodejs";

export async function GET() {
  const u = await requireAuthUser().catch(() => null);
  if (!u?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const codes = await adminListPromoCodes();
  return NextResponse.json({ codes });
}

export async function POST(req: Request) {
  const u = await requireAuthUser().catch(() => null);
  if (!u?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const code = typeof o.code === "string" ? o.code : "";
  const maxUses = typeof o.maxUses === "number" ? o.maxUses : Number(o.maxUses);
  const slotsPerRedeem = typeof o.slotsPerRedeem === "number" ? o.slotsPerRedeem : Number(o.slotsPerRedeem);
  const label = typeof o.label === "string" ? o.label : null;
  const expiresAt = typeof o.expiresAt === "string" ? o.expiresAt : null;

  if (!Number.isFinite(maxUses) || maxUses < 1) return NextResponse.json({ error: "maxUses must be a positive number" }, { status: 400 });
  if (!Number.isFinite(slotsPerRedeem) || slotsPerRedeem < 1) {
    return NextResponse.json({ error: "slotsPerRedeem must be a positive number" }, { status: 400 });
  }

  const out = await adminCreatePromoCode({
    code,
    label,
    maxUses,
    slotsPerRedeem,
    expiresAt: expiresAt?.trim() ? expiresAt.trim() : null,
  });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
  return NextResponse.json({ ok: true as const, id: out.id });
}
