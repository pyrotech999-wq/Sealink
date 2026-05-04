import type { VesselClassifiedListing } from "@/lib/vessel-classifieds-types";
import { nextExpiryFrom } from "@/lib/vessel-classifieds-store-shared";

/** Admin- or promo-granted publication without PayPal/Stripe. */
export function applyComplimentaryActive(
  l: VesselClassifiedListing,
  provider: "comp" | "promo",
  paymentRef: string,
): VesselClassifiedListing {
  const now = new Date();
  return {
    ...l,
    paymentStatus: "paid",
    paymentProvider: provider,
    paymentRef: paymentRef.slice(0, 240),
    status: "active",
    expiresAt: nextExpiryFrom(now, l.expiresAt),
  };
}
