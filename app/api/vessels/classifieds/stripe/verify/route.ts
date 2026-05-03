import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { loadVesselClassifieds } from "@/lib/vessel-classifieds-store";
import { getStripe, stripeSecretKey } from "@/lib/stripe-server";
import { applyVesselClassifiedStripePayment } from "@/lib/vessel-stripe-complete";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  if (!stripeSecretKey()) return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sessionId =
    typeof body === "object" && body !== null && "sessionId" in body
      ? String((body as { sessionId?: unknown }).sessionId ?? "").trim()
      : "";
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Could not load checkout session.", detail: msg.slice(0, 400) }, { status: 502 });
  }

  const listingId = session.metadata?.listing_id?.trim() ?? "";
  if (!listingId) {
    return NextResponse.json({ error: "Invalid checkout session" }, { status: 400 });
  }

  const all = await loadVesselClassifieds();
  const listing = all.find((l) => l.id === listingId);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!u.isAdmin && listing.ownerUid !== u.uid) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const applied = await applyVesselClassifiedStripePayment(session);
  if (!applied.ok) {
    return NextResponse.json({ error: applied.error }, { status: applied.status });
  }

  return NextResponse.json({ ok: true as const });
}
