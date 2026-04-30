import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { getAppBaseUrl, getStripe } from "@/lib/stripe-server";
import { loadVesselClassifieds, updateVesselListing, adminUpdateVesselListing } from "@/lib/vessel-classifieds-store";

export const runtime = "nodejs";

const PRICE_GBP = 30;

export async function POST(req: Request) {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body === "object" && body !== null && "id" in body ? String((body as { id?: unknown }).id ?? "") : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const all = await loadVesselClassifieds();
  const listing = all.find((l) => l.id === id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!u.isAdmin && listing.ownerUid !== u.uid) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (listing.status === "removed" || listing.status === "expired") return NextResponse.json({ error: "Listing is not payable" }, { status: 400 });
  if (listing.paymentStatus === "paid") return NextResponse.json({ error: "Already paid" }, { status: 400 });

  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const base = getAppBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "gbp",
          unit_amount: PRICE_GBP * 100,
          product_data: { name: "SeaLink vessel classified (6 months)" },
        },
        quantity: 1,
      },
    ],
    success_url: `${base}/vessels?paid=1&provider=stripe&listing=${encodeURIComponent(id)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/vessels?canceled=1`,
    metadata: { vessel_listing_id: id, provider: "stripe", owner_uid: listing.ownerUid },
  });

  const markPending = (l: typeof listing) => ({ ...l, paymentStatus: "pending" as const, paymentProvider: "stripe" as const, paymentRef: session.id });
  const out = u.isAdmin ? await adminUpdateVesselListing(id, markPending) : await updateVesselListing(id, u.uid, markPending);
  if (!out.ok) return NextResponse.json({ error: out.error ?? "Could not start payment" }, { status: 400 });

  return NextResponse.json({ url: session.url });
}

