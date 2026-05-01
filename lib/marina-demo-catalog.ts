export type MarinaListing = {
  id: string;
  name: string;
  harbour: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
  /** Indicative lowest nightly berth rate (EUR). */
  priceFromEur: number;
  maxLengthM: number;
  depthM: number;
  facilities: string[];
  description: string;
};

/** Demo data for the marina booking MVP — replace with API / partner feed later. */
export const MARINA_DEMO_CATALOG: readonly MarinaListing[] = [
  {
    id: "plymouth-qab",
    name: "Queen Anne’s Battery",
    harbour: "Plymouth",
    region: "Devon",
    country: "United Kingdom",
    lat: 50.3677,
    lng: -4.1503,
    priceFromEur: 42,
    maxLengthM: 18,
    depthM: 4.2,
    facilities: ["Water", "Electricity", "Wi‑Fi", "Showers", "Laundry", "Fuel nearby"],
    description: "Walk to the Barbican and city centre; all-tide access with pilotage notes for larger yachts.",
  },
  {
    id: "falmouth",
    name: "Falmouth Marina",
    harbour: "Falmouth",
    region: "Cornwall",
    country: "United Kingdom",
    lat: 50.1547,
    lng: -5.0651,
    priceFromEur: 48,
    maxLengthM: 25,
    depthM: 5,
    facilities: ["Water", "Electricity", "Wi‑Fi", "Showers", "Boatyard"],
    description: "Deep-water berths close to Carrick Roads; good base for Scillies hops.",
  },
  {
    id: "la-rochelle",
    name: "Port des Minimes",
    harbour: "La Rochelle",
    region: "Charente-Maritime",
    country: "France",
    lat: 46.1423,
    lng: -1.1678,
    priceFromEur: 38,
    maxLengthM: 30,
    depthM: 6,
    facilities: ["Water", "Electricity", "Wi‑Fi", "Showers", "Bike hire", "Chandlery"],
    description: "One of Europe’s largest pleasure harbours; short cycle to the old town and Île de Ré.",
  },
  {
    id: "lisbon",
    name: "Doca de Santo Amaro",
    harbour: "Lisbon",
    region: "Lisboa",
    country: "Portugal",
    lat: 38.6979,
    lng: -9.1722,
    priceFromEur: 55,
    maxLengthM: 40,
    depthM: 7,
    facilities: ["Water", "Electricity", "Wi‑Fi", "24h security", "Restaurants"],
    description: "City-centre marina beneath 25 de Abril bridge; tidal currents need planning on entry.",
  },
  {
    id: "porto-montenegro",
    name: "Porto Montenegro",
    harbour: "Tivat",
    region: "Bay of Kotor",
    country: "Montenegro",
    lat: 42.4325,
    lng: 18.6986,
    priceFromEur: 85,
    maxLengthM: 100,
    depthM: 12,
    facilities: ["Water", "Electricity", "Wi‑Fi", "Fuel dock", "Luxury services", "Helipad"],
    description: "Full-service superyacht hub with boutiques and international clearance support.",
  },
  {
    id: "ibiza",
    name: "Marina Ibiza",
    harbour: "Ibiza Town",
    region: "Balearic Islands",
    country: "Spain",
    lat: 38.9088,
    lng: 1.4377,
    priceFromEur: 72,
    maxLengthM: 60,
    depthM: 8,
    facilities: ["Water", "Electricity", "Wi‑Fi", "Pool", "Concierge"],
    description: "Upscale berthing steps from Dalt Vila; peak season books early.",
  },
] as const;
