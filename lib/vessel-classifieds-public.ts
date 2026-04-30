import type { VesselClassifiedListing, VesselClassifiedPublic } from "@/lib/vessel-classifieds-types";

export function toPublicVesselListing(
  l: VesselClassifiedListing,
  viewerUid: string,
): VesselClassifiedPublic {
  const { ownerUid, ...rest } = l;
  return { ...rest, isOwner: ownerUid === viewerUid };
}

