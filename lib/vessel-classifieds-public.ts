import type { VesselClassifiedListing, VesselClassifiedPublic } from "@/lib/vessel-classifieds-types";

export function toPublicVesselListing(
  l: VesselClassifiedListing,
  viewerUid: string,
): VesselClassifiedPublic {
  const { ownerUid, ...rest } = l;
  const isOwner = ownerUid === viewerUid;
  return {
    ...rest,
    contactPhone: rest.contactPhonePublic || isOwner ? rest.contactPhone : null,
    isOwner,
  };
}

