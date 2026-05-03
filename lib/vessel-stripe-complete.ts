import type Stripe from "stripe";
import { loadVesselClassifieds, updateVesselListing, nextExpiryFrom } from "@/lib/vessel-classifieds-store";

/**
 * Finalize a vessel classified after Stripe Checkout (payment mode).
 * Session metadata must include `listing_id` and `user_uid` (listing owner), both set server-side when creating Checkout.
 */
export async function applyVesselClassifiedStripePayment(
  session: Stripe.Checkout.Session,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (session.mode !== "payment") {
    return { ok: false, error: "Not a one-time payment session", status: 400 };
  }
  if (session.payment_status !== "paid") {
    return { ok: false, error: "Payment not completed yet", status: 400 };
  }
  const listingId = session.metadata?.listing_id?.trim() ?? "";
  const metaUid = session.metadata?.user_uid?.trim() ?? "";
  if (!listingId || !metaUid) {
    return { ok: false, error: "Missing listing metadata on checkout session", status: 400 };
  }

  const all = await loadVesselClassifieds();
  const listing = all.find((l) => l.id === listingId);
  if (!listing) return { ok: false, error: "Listing not found", status: 404 };
  if (listing.ownerUid !== metaUid) {
    return { ok: false, error: "Listing owner mismatch", status: 403 };
  }
  if (listing.status === "removed") {
    return { ok: false, error: "Listing is not payable", status: 400 };
  }

  if (listing.paymentStatus === "paid" && listing.paymentRef === session.id) {
    return { ok: true };
  }
  if (listing.paymentRef !== session.id) {
    return {
      ok: false,
      error: "This listing is not linked to this checkout session. Open checkout again from your drafts.",
      status: 409,
    };
  }
  if (listing.paymentStatus !== "pending") {
    return { ok: false, error: "Listing is not awaiting payment completion", status: 409 };
  }

  const now = new Date();
  const apply = (l: typeof listing) => ({
    ...l,
    paymentStatus: "paid" as const,
    paymentProvider: "stripe" as const,
    paymentRef: session.id,
    status: "active" as const,
    expiresAt: nextExpiryFrom(now, l.expiresAt),
  });

  const out = await updateVesselListing(listingId, listing.ownerUid, apply);
  if (!out.ok) return { ok: false, error: out.error ?? "Could not activate listing", status: 400 };
  return { ok: true };
}
