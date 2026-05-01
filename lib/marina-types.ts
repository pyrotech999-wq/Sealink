/** Shared shape for marina search / booking (JSON seed + Supabase rows). */
export type MarinaListing = {
  id: string;
  name: string;
  harbour: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
  priceFromEur: number | null;
  maxLengthM: number | null;
  depthM: number | null;
  facilities: string[];
  description: string;
  phone: string;
};
