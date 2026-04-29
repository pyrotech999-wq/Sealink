export type GearCategoryId =
  | "accessories"
  | "clothing_diving"
  | "interior_decor"
  | "galley_cooking"
  | "fishing"
  | "mechanical"
  | "mooring_anchors_buoys"
  | "safety_pfd_flares"
  | "electronics_nav"
  | "water_sports_tenders"
  | "deck_rigging_hardware"
  | "maintenance_cleaning"
  | "other";

export const GEAR_CATEGORIES: readonly { id: GearCategoryId; label: string; hint: string }[] = [
  { id: "accessories", label: "Boat accessories", hint: "Fenders, covers, hooks, organisers…" },
  { id: "clothing_diving", label: "Clothing & diving", hint: "Sailing kit, wetsuits, masks, fins…" },
  { id: "interior_decor", label: "Interior & décor", hint: "Cushions, lighting, curtains, cabin bits…" },
  { id: "galley_cooking", label: "Galley & cooking", hint: "Stoves, pots, cool boxes, utensils…" },
  { id: "fishing", label: "Fishing tackle", hint: "Rods, reels, lures, nets…" },
  { id: "mechanical", label: "Mechanical & parts", hint: "Filters, pumps, tools, spares (not whole boats)…" },
  { id: "mooring_anchors_buoys", label: "Anchors, buoys & mooring", hint: "Chain, rode, mooring buoys, dock lines…" },
  { id: "safety_pfd_flares", label: "Safety & PFDs", hint: "Lifejackets, harnesses, flares, first aid…" },
  { id: "electronics_nav", label: "Electronics & navigation", hint: "VHFs, instruments, chargers, antennas…" },
  { id: "water_sports_tenders", label: "Water sports & tenders", hint: "Kayaks, SUPs, outboards for dinghies…" },
  { id: "deck_rigging_hardware", label: "Deck & rigging", hint: "Winches, blocks, cleats, rope…" },
  { id: "maintenance_cleaning", label: "Maintenance & cleaning", hint: "Polish, antifoul supplies, brushes…" },
  { id: "other", label: "Other boat stuff", hint: "Anything else for life afloat (not hulls)…" },
] as const;

export function isGearCategoryId(v: string): v is GearCategoryId {
  return GEAR_CATEGORIES.some((c) => c.id === v);
}

export type GearListing = {
  id: string;
  sellerUid: string;
  title: string;
  description: string;
  categoryId: GearCategoryId;
  priceLabel: string | null;
  createdAt: string;
  expiresAt: string;
  soldAt: string | null;
  /** Set when listing first enters the reminder window (one ping per expiry period). */
  reminderSentAt: string | null;
};

export type GearListingPublic = Omit<GearListing, "sellerUid"> & {
  isOwner: boolean;
  /** Whole days until expiry (0 = today). */
  daysUntilExpiry: number;
};
