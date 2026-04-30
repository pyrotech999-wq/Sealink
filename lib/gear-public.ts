import type { GearListing, GearListingPublic } from "@/lib/gear-types";
import { daysUntilExpiry } from "@/lib/gear-store";

export function toPublicListing(l: GearListing, viewerUid: string): GearListingPublic {
  const { sellerUid, ...rest } = l;
  return {
    ...rest,
    isOwner: sellerUid === viewerUid,
    daysUntilExpiry: daysUntilExpiry(l.expiresAt),
  };
}
