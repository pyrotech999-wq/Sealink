import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe-server";
import { loadVesselClassifieds, updateVesselListing, adminUpdateVesselListing } from "@/lib/vessel-classifieds-store";

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
  const sessionId =
    typeof body === "object" && body !== null && "sessionId" in body ? String((body as { sessionId?: unknown }).sessionId ?? "") : "";
  const listingId =
    typeof body === "object" && body !== null && "listingId" in body ? String((body as { listingId?: unknown }).listingId ?? "") : "";
  if (!sessionId || !listingId) return NextResponse.json({ error: "sessionId and listingId required" }, { status: 400 });

  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") {
    return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
  }

  const all = await loadVesselClassifieds();
  const listing = all.find((l) => l.id === listingId);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!u.isAdmin && listing.ownerUid !== u.uid) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const apply = (l: typeof listing) => ({
    ...l,
    paymentStatus: "paid" as const,
    paymentProvider: "stripe" as const,
    paymentRef: sessionId,
    status: "active" as const,
  });

  const out = u.isAdmin ? await adminUpdateVesselListing(listingId, apply) : await updateVesselListing(listingId, u.uid, apply);
  if (!out.ok) return NextResponse.json({ error: out.error ?? "Could not activate" }, { status: 400 });

  return NextResponse.json({ ok: true as const });
}

