import type { GearListing, GearListingPublic } from "@/lib/gear-types";
import { daysUntilExpiry } from "@/lib/gear-store";

export function toPublicListing(l: GearListing, viewerUid: string): GearListingPublic {
  const { sellerUid: _s, ...rest } = l;
  return {
    ...rest,
    isOwner: l.sellerUid === viewerUid,
    daysUntilExpiry: daysUntilExpiry(l.expiresAt),
  };
}
