import type { GearListing, GearListingPublic } from "@/lib/gear-types";
import { daysUntilExpiry } from "@/lib/gear-store";

export function toPublicListing(l: GearListing, viewerUids: string[] | string): GearListingPublic {
  const { sellerUid, ...rest } = l;
  const set = new Set(Array.isArray(viewerUids) ? viewerUids.filter(Boolean) : [viewerUids].filter(Boolean));
  return {
    ...rest,
    isOwner: set.has(sellerUid),
    daysUntilExpiry: daysUntilExpiry(l.expiresAt),
  };
}
