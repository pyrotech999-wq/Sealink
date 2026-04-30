export type VesselCategoryId =
  | "sailing_yachts"
  | "motor_yachts_cruisers"
  | "catamarans_multihulls"
  | "fishing_boats"
  | "adventure_expedition"
  | "dive_vessels"
  | "commercial_workboats"
  | "ribs_tenders"
  | "inland_canal"
  | "dayboats_runabouts"
  | "personal_watercraft"
  | "houseboats_unusual"
  | "other";

export const VESSEL_CATEGORIES: readonly { id: VesselCategoryId; label: string; hint: string }[] = [
  { id: "sailing_yachts", label: "Sailing yachts", hint: "Cruising, performance, bluewater, classic" },
  { id: "motor_yachts_cruisers", label: "Motor yachts & cruisers", hint: "Flybridge, sports cruiser, trawler, expedition" },
  { id: "catamarans_multihulls", label: "Catamarans & multihulls", hint: "Sailing cat, power cat, trimaran" },
  { id: "fishing_boats", label: "Fishing boats", hint: "Offshore, inshore, sportfisher, centre console" },
  { id: "adventure_expedition", label: "Adventure / expedition", hint: "Long-range, high-latitude, liveaboard-ready" },
  { id: "dive_vessels", label: "Dive vessels", hint: "Day boat, liveaboard dive, support craft" },
  { id: "commercial_workboats", label: "Commercial & workboats", hint: "Pilot, utility, survey, crew transfer" },
  { id: "ribs_tenders", label: "RIBs & tenders", hint: "RIB, rigid tender, inflatable" },
  { id: "inland_canal", label: "Canal & inland", hint: "Narrowboat, Dutch barge, river cruiser" },
  { id: "dayboats_runabouts", label: "Day boats & runabouts", hint: "Bowrider, day cruiser" },
  { id: "personal_watercraft", label: "Personal watercraft", hint: "Jet ski / PWC" },
  { id: "houseboats_unusual", label: "Houseboats & unusual", hint: "Houseboat, converted craft, oddities" },
  { id: "other", label: "Other", hint: "Anything else" },
] as const;

export function isVesselCategoryId(v: string): v is VesselCategoryId {
  return VESSEL_CATEGORIES.some((c) => c.id === v);
}

export type VesselListingStatus = "draft" | "active" | "expired" | "removed";
export type VesselPaymentProvider = "paypal";
export type VesselPaymentStatus = "unpaid" | "pending" | "paid";

export type VesselClassifiedListing = {
  id: string;
  ownerUid: string;
  createdAt: string;
  expiresAt: string;
  removedAt: string | null;

  status: VesselListingStatus;
  paymentStatus: VesselPaymentStatus;
  paymentProvider: VesselPaymentProvider | null;
  paymentRef: string | null; // stripe session id, paypal order id, etc.

  categoryId: VesselCategoryId;
  title: string;
  description: string;
  priceGbp: number | null;
  locationLabel: string | null; // e.g. "Plymouth" / "South Coast"

  // Optional basic specs
  year: number | null;
  lengthFt: number | null;
  makeModel: string | null;

  imageUrls: string[]; // public /uploads/vessels/<id>/...
};

export type VesselClassifiedPublic = Omit<VesselClassifiedListing, "ownerUid"> & {
  isOwner: boolean;
};

