import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { loadVesselClassifieds, updateVesselListing, adminUpdateVesselListing } from "@/lib/vessel-classifieds-store";
import { getStripe, stripeSecretKey } from "@/lib/stripe-server";

export const runtime = "nodejs";

const PRICE_GBP_MINOR = 3000; // £30.00

export async function POST(req: Request): Promise<Response> {
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

  if (!stripeSecretKey()) return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });

  const all = await loadVesselClassifieds();
  const listing = all.find((l) => l.id === id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!u.isAdmin && listing.ownerUid !== u.uid) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (listing.status === "removed") return NextResponse.json({ error: "Listing is not payable" }, { status: 400 });

  const base = getAppBaseUrl();
  const stripe = getStripe();
  const isRenewal = listing.status === "expired" || listing.paymentStatus === "paid";
  const description = isRenewal
    ? "SeaLink vessel classified renewal (6 months)"
    : "SeaLink vessel classified (6 months)";

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "gbp",
            unit_amount: PRICE_GBP_MINOR,
            product_data: {
              name: description,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${base}/vessels?paid=1&provider=stripe&listing=${encodeURIComponent(id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/vessels?canceled=1`,
      metadata: {
        purpose: "vessel_classified",
        listing_id: id,
        user_uid: listing.ownerUid,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Stripe checkout could not be started.", detail: msg.slice(0, 800) }, { status: 502 });
  }

  if (!session.url) {
    return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
  }

  const markPending = (l: typeof listing) => ({
    ...l,
    paymentStatus: "pending" as const,
    paymentProvider: "stripe" as const,
    paymentRef: session.id,
  });
  const out = u.isAdmin
    ? await adminUpdateVesselListing(id, markPending)
    : await updateVesselListing(id, listing.ownerUid, markPending);
  if (!out.ok) return NextResponse.json({ error: out.error ?? "Could not start payment" }, { status: 400 });

  return NextResponse.json({ url: session.url, sessionId: session.id });
}
