import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { loadVesselClassifieds, adminUpdateVesselListing } from "@/lib/vessel-classifieds-store";
import { applyComplimentaryActive } from "@/lib/vessel-classifieds-activate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const u = await requireAuthUser().catch(() => null);
  if (!u?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const listingId =
    typeof body === "object" && body !== null && "listingId" in body
      ? String((body as { listingId?: unknown }).listingId ?? "").trim()
      : "";
  if (!listingId) return NextResponse.json({ error: "listingId required" }, { status: 400 });

  const all = await loadVesselClassifieds();
  const listing = all.find((l) => l.id === listingId);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (listing.status === "removed") return NextResponse.json({ error: "Listing removed" }, { status: 400 });
  if (listing.paymentStatus === "paid" && listing.status === "active") {
    return NextResponse.json({ error: "Listing is already live" }, { status: 400 });
  }

  const out = await adminUpdateVesselListing(listingId, (l) => applyComplimentaryActive(l, "comp", `admin:${u.email}`));
  if (!out.ok) return NextResponse.json({ error: out.error ?? "Update failed" }, { status: 400 });
  return NextResponse.json({ ok: true as const });
}
