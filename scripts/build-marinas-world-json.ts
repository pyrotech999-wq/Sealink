/**
 * Generates data/marinas-world.json from a compact seed list.
 * Run: npx tsx scripts/build-marinas-world-json.ts
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

type Seed = {
  id: string;
  name: string;
  harbour: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
  phone?: string;
  priceFromEur?: number;
  maxLengthM?: number;
  depthM?: number;
  facilities?: string[];
  description?: string;
};

const DEFAULT_FACILITIES = ["Water", "Electricity", "Wi‑Fi", "Showers"];

const seeds: Seed[] = [
  // ——— Existing six (refined) ———
  {
    id: "plymouth-qab",
    name: "Queen Anne’s Battery",
    harbour: "Plymouth",
    region: "Devon",
    country: "United Kingdom",
    lat: 50.3677,
    lng: -4.1503,
    phone: "+44 1752 206200",
    priceFromEur: 42,
    maxLengthM: 18,
    depthM: 4.2,
    facilities: ["Water", "Electricity", "Wi‑Fi", "Showers", "Laundry", "Fuel nearby"],
    description:
      "Walk to the Barbican and city centre; all-tide access with pilotage notes for larger yachts.",
  },
  {
    id: "falmouth",
    name: "Falmouth Marina",
    harbour: "Falmouth",
    region: "Cornwall",
    country: "United Kingdom",
    lat: 50.1547,
    lng: -5.0651,
    phone: "+44 1326 211200",
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
    phone: "+33 5 46 44 36 86",
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
    phone: "+351 21 393 9594",
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
    phone: "+382 32 661 039",
    priceFromEur: 85,
    maxLengthM: 100,
    depthM: 12,
    facilities: ["Water", "Electricity", "Wi‑Fi", "Fuel dock", "Luxury services", "Helipad"],
    description: "Full-service superyacht hub with boutiques and international clearance support.",
  },
  {
    id: "es-ibiza",
    name: "Marina Ibiza",
    harbour: "Ibiza Town",
    region: "Balearic Islands",
    country: "Spain",
    lat: 38.9088,
    lng: 1.4377,
    phone: "+34 971 31 99 00",
    priceFromEur: 72,
    maxLengthM: 60,
    depthM: 8,
    facilities: ["Water", "Electricity", "Wi‑Fi", "Pool", "Concierge"],
    description: "Upscale berthing steps from Dalt Vila; peak season books early.",
  },
  // ——— United Kingdom & Ireland ———
  { id: "gb-southampton-ov", name: "Ocean Village Marina", harbour: "Southampton", region: "Hampshire", country: "United Kingdom", lat: 50.8952, lng: -1.3878, phone: "+44 23 8022 0001", maxLengthM: 40, depthM: 6 },
  { id: "gb-portsmouth-gunwharf", name: "Gunwharf Quays Marina", harbour: "Portsmouth", region: "Hampshire", country: "United Kingdom", lat: 50.7967, lng: -1.1086, phone: "+44 23 9283 9777", maxLengthM: 36, depthM: 5 },
  { id: "gb-chichester", name: "Chichester Marina", harbour: "Chichester", region: "West Sussex", country: "United Kingdom", lat: 50.7986, lng: -0.9297, phone: "+44 1243 512731", maxLengthM: 24, depthM: 3.5 },
  { id: "gb-brighton", name: "Brighton Marina", harbour: "Brighton", region: "East Sussex", country: "United Kingdom", lat: 50.8136, lng: -0.1044, phone: "+44 1273 819919", maxLengthM: 35, depthM: 5 },
  { id: "gb-dover", name: "Dover Marina", harbour: "Dover", region: "Kent", country: "United Kingdom", lat: 51.1258, lng: 1.3139, phone: "+44 1304 241 690", maxLengthM: 40, depthM: 6 },
  { id: "gb-liverpool", name: "Liverpool Marina", harbour: "Liverpool", region: "Merseyside", country: "United Kingdom", lat: 53.466, lng: -3.028, phone: "+44 151 708 8870", maxLengthM: 30, depthM: 5 },
  { id: "gb-glasgow-kgv", name: "KGV Dock", harbour: "Glasgow", region: "Scotland", country: "United Kingdom", lat: 55.8609, lng: -4.2514, phone: "+44 141 427 2776", maxLengthM: 28, depthM: 5 },
  { id: "gb-inverness", name: "Seaport Marina Inverness", harbour: "Inverness", region: "Scotland", country: "United Kingdom", lat: 57.4778, lng: -4.2247, phone: "+44 1463 717000", maxLengthM: 22, depthM: 4 },
  { id: "ie-dun-laoghaire", name: "Dún Laoghaire Marina", harbour: "Dún Laoghaire", region: "Dublin", country: "Ireland", lat: 53.2936, lng: -6.1358, phone: "+353 1 280 1811", maxLengthM: 30, depthM: 5 },
  { id: "ie-cork", name: "Cork City Marina", harbour: "Cork", region: "County Cork", country: "Ireland", lat: 51.901, lng: -8.465, phone: "+353 21 484 5200", maxLengthM: 25, depthM: 4.5 },
  // ——— France ———
  { id: "fr-cherbourg", name: "Port Chantereyne", harbour: "Cherbourg", region: "Normandy", country: "France", lat: 49.648, lng: -1.611, phone: "+33 2 33 93 11 02", maxLengthM: 45, depthM: 8 },
  { id: "fr-brest", name: "Port du Moulin Blanc", harbour: "Brest", region: "Brittany", country: "France", lat: 48.385, lng: -4.49, phone: "+33 2 98 44 84 39", maxLengthM: 35, depthM: 6 },
  { id: "fr-lorient", name: "Lorient La Base", harbour: "Lorient", region: "Brittany", country: "France", lat: 47.726, lng: -3.37, phone: "+33 2 97 21 25 25", maxLengthM: 40, depthM: 7 },
  { id: "fr-vannes", name: "Port de Vannes", harbour: "Vannes", region: "Brittany", country: "France", lat: 47.655, lng: -2.76, phone: "+33 2 97 01 62 30", maxLengthM: 28, depthM: 5 },
  { id: "fr-marseille-vieux", name: "Vieux-Port Marseille", harbour: "Marseille", region: "Provence", country: "France", lat: 43.295, lng: 5.375, phone: "+33 4 91 52 08 20", maxLengthM: 45, depthM: 6 },
  { id: "fr-nice", name: "Port de Nice", harbour: "Nice", region: "Côte d'Azur", country: "France", lat: 43.695, lng: 7.285, phone: "+33 4 93 217 217", maxLengthM: 50, depthM: 8 },
  { id: "fr-cannes", name: "Port Pierre Canto", harbour: "Cannes", region: "Côte d'Azur", country: "France", lat: 43.548, lng: 7.025, phone: "+33 4 93 39 22 00", maxLengthM: 60, depthM: 8 },
  { id: "fr-arcachon", name: "Port d'Arcachon", harbour: "Arcachon", region: "Nouvelle-Aquitaine", country: "France", lat: 44.658, lng: -1.168, phone: "+33 5 56 83 11 77", maxLengthM: 22, depthM: 4 },
  // ——— Iberia ———
  { id: "es-barcelona", name: "Port Vell", harbour: "Barcelona", region: "Catalonia", country: "Spain", lat: 41.385, lng: 2.18, phone: "+34 932 21 74 17", maxLengthM: 90, depthM: 10 },
  { id: "es-valencia", name: "Marina Real Juan Carlos I", harbour: "Valencia", region: "Valencia", country: "Spain", lat: 39.455, lng: -0.32, phone: "+34 963 67 50 62", maxLengthM: 70, depthM: 8 },
  { id: "es-palma", name: "Club de Mar Palma", harbour: "Palma", region: "Mallorca", country: "Spain", lat: 39.565, lng: 2.628, phone: "+34 971 72 50 00", maxLengthM: 80, depthM: 9 },
  { id: "es-mahon", name: "Port de Maó", harbour: "Mahón", region: "Menorca", country: "Spain", lat: 39.889, lng: 4.265, phone: "+34 971 36 50 00", maxLengthM: 45, depthM: 7 },
  { id: "es-malaga", name: "Muelle Uno", harbour: "Málaga", region: "Andalusia", country: "Spain", lat: 36.715, lng: -4.415, phone: "+34 952 00 77 77", maxLengthM: 40, depthM: 6 },
  { id: "es-las-palmas", name: "Marina Las Palmas", harbour: "Las Palmas", region: "Gran Canaria", country: "Spain", lat: 28.144, lng: -15.42, phone: "+34 928 24 49 00", maxLengthM: 50, depthM: 8 },
  { id: "pt-porto-leixoes", name: "Douro Marina", harbour: "Porto", region: "Porto", country: "Portugal", lat: 41.175, lng: -8.69, phone: "+351 22 900 1000", maxLengthM: 25, depthM: 5 },
  { id: "pt-lagos", name: "Marina de Lagos", harbour: "Lagos", region: "Algarve", country: "Portugal", lat: 37.105, lng: -8.675, phone: "+351 282 770 200", maxLengthM: 30, depthM: 5 },
  { id: "pt-cascais", name: "Cascais Marina", harbour: "Cascais", region: "Lisboa", country: "Portugal", lat: 38.697, lng: -9.42, phone: "+351 214 824 000", maxLengthM: 35, depthM: 6 },
  // ——— Italy ———
  { id: "it-genoa", name: "Marina Molo Vecchio", harbour: "Genoa", region: "Liguria", country: "Italy", lat: 44.405, lng: 8.915, phone: "+39 010 25 35 181", maxLengthM: 70, depthM: 9 },
  { id: "it-civitavecchia", name: "Porto di Civitavecchia", harbour: "Civitavecchia", region: "Lazio", country: "Italy", lat: 42.095, lng: 11.795, phone: "+39 0766 22 91", maxLengthM: 50, depthM: 8 },
  { id: "it-naples", name: "Marina Molo Luise", harbour: "Naples", region: "Campania", country: "Italy", lat: 40.835, lng: 14.265, phone: "+39 081 552 0767", maxLengthM: 45, depthM: 7 },
  { id: "it-venice", name: "Marina Venezia", harbour: "Venice", region: "Veneto", country: "Italy", lat: 45.435, lng: 12.335, phone: "+39 041 531 3111", maxLengthM: 35, depthM: 6 },
  { id: "it-olbia", name: "Marina di Olbia", harbour: "Olbia", region: "Sardinia", country: "Italy", lat: 40.915, lng: 9.515, phone: "+39 0789 19 345", maxLengthM: 55, depthM: 8 },
  { id: "it-taormina", name: "Porto di Giardini Naxos", harbour: "Giardini Naxos", region: "Sicily", country: "Italy", lat: 37.825, lng: 15.275, phone: "+39 0942 51 211", maxLengthM: 30, depthM: 6 },
  // ——— Greece & Cyprus ———
  { id: "gr-athens", name: "Alimos Marina", harbour: "Athens", region: "Attica", country: "Greece", lat: 37.905, lng: 23.71, phone: "+30 210 98 80 970", maxLengthM: 50, depthM: 7 },
  { id: "gr-corfu", name: "Mandraki Marina", harbour: "Corfu Town", region: "Ionian Islands", country: "Greece", lat: 39.625, lng: 19.915, phone: "+30 26610 39420", maxLengthM: 40, depthM: 6 },
  { id: "gr-rhodes", name: "Mandraki Harbour", harbour: "Rhodes Town", region: "Dodecanese", country: "Greece", lat: 36.45, lng: 28.225, phone: "+30 22410 27623", maxLengthM: 45, depthM: 7 },
  { id: "gr-mykonos", name: "Mykonos New Port", harbour: "Mykonos", region: "Cyclades", country: "Greece", lat: 37.45, lng: 25.325, phone: "+30 22890 22218", maxLengthM: 35, depthM: 6 },
  { id: "cy-limassol", name: "Limassol Marina", harbour: "Limassol", region: "Limassol", country: "Cyprus", lat: 34.685, lng: 33.045, phone: "+357 25 020 020", maxLengthM: 60, depthM: 8 },
  // ——— Croatia & Slovenia ———
  { id: "hr-dubrovnik", name: "ACI Marina Dubrovnik", harbour: "Dubrovnik", region: "Dubrovnik-Neretva", country: "Croatia", lat: 42.67, lng: 18.085, phone: "+385 20 455 020", maxLengthM: 40, depthM: 6 },
  { id: "hr-split", name: "ACI Marina Split", harbour: "Split", region: "Split-Dalmatia", country: "Croatia", lat: 43.505, lng: 16.435, phone: "+385 21 398 127", maxLengthM: 45, depthM: 7 },
  { id: "hr-hvar", name: "Hvar Town Harbour", harbour: "Hvar", region: "Split-Dalmatia", country: "Croatia", lat: 43.17, lng: 16.44, phone: "+385 21 741 007", maxLengthM: 35, depthM: 6 },
  { id: "hr-zadar", name: "Marina Zadar", harbour: "Zadar", region: "Zadar", country: "Croatia", lat: 44.115, lng: 15.235, phone: "+385 23 333 800", maxLengthM: 40, depthM: 6 },
  { id: "si-piran", name: "Marina Piran", harbour: "Piran", region: "Slovenian Istria", country: "Slovenia", lat: 45.525, lng: 13.57, phone: "+386 5 673 4600", maxLengthM: 22, depthM: 4 },
  // ——— Northern Europe ———
  { id: "nl-ijmuiden", name: "IJmuiden Marina", harbour: "IJmuiden", region: "North Holland", country: "Netherlands", lat: 52.465, lng: 4.565, phone: "+31 255 51 22 88", maxLengthM: 28, depthM: 5 },
  { id: "nl-amsterdam", name: "Sixhaven Marina", harbour: "Amsterdam", region: "North Holland", country: "Netherlands", lat: 52.385, lng: 4.905, phone: "+31 20 636 33 00", maxLengthM: 24, depthM: 4 },
  { id: "de-hamburg", name: "Hamburg City Sporthafen", harbour: "Hamburg", region: "Hamburg", country: "Germany", lat: 53.545, lng: 9.965, phone: "+49 40 361 868 0", maxLengthM: 30, depthM: 5 },
  { id: "de-kiel", name: "Olympiazentrum Kiel", harbour: "Kiel", region: "Schleswig-Holstein", country: "Germany", lat: 54.325, lng: 10.145, phone: "+49 431 982 020", maxLengthM: 35, depthM: 6 },
  { id: "dk-copenhagen", name: "Langelinie Marina", harbour: "Copenhagen", region: "Capital Region", country: "Denmark", lat: 55.695, lng: 12.595, phone: "+45 33 13 10 50", maxLengthM: 32, depthM: 5 },
  { id: "se-stockholm", name: "Wasahamnen", harbour: "Stockholm", region: "Stockholm County", country: "Sweden", lat: 59.32, lng: 18.095, phone: "+46 8 120 058 81", maxLengthM: 28, depthM: 5 },
  { id: "no-bergen", name: "Bergen Guest Marina", harbour: "Bergen", region: "Vestland", country: "Norway", lat: 60.395, lng: 5.315, phone: "+47 55 30 80 30", maxLengthM: 40, depthM: 8 },
  { id: "pl-gdansk", name: "Marina Gdańsk", harbour: "Gdańsk", region: "Pomerania", country: "Poland", lat: 54.355, lng: 18.655, phone: "+48 58 301 43 12", maxLengthM: 30, depthM: 5 },
  // ——— Turkey & Malta ———
  { id: "tr-marmaris", name: "Netsel Marmaris Marina", harbour: "Marmaris", region: "Muğla", country: "Turkey", lat: 36.855, lng: 28.275, phone: "+90 252 412 2708", maxLengthM: 45, depthM: 7 },
  { id: "tr-bodrum", name: "Yalıkavak Marina", harbour: "Bodrum", region: "Muğla", country: "Turkey", lat: 37.105, lng: 27.285, phone: "+90 252 311 3311", maxLengthM: 80, depthM: 10 },
  { id: "mt-valletta", name: "Grand Harbour Marina", harbour: "Vittoriosa", region: "Malta", country: "Malta", lat: 35.89, lng: 14.52, phone: "+356 21 809 000", maxLengthM: 70, depthM: 9 },
  // ——— Americas ———
  { id: "us-newport-ri", name: "Newport Yachting Center", harbour: "Newport", region: "Rhode Island", country: "United States", lat: 41.485, lng: -71.315, phone: "+1 401-847-1000", maxLengthM: 45, depthM: 6 },
  { id: "us-boston", name: "Constitution Marina", harbour: "Boston", region: "Massachusetts", country: "United States", lat: 42.37, lng: -71.055, phone: "+1 617-242-3821", maxLengthM: 30, depthM: 5 },
  { id: "us-annapolis", name: "Annapolis City Dock", harbour: "Annapolis", region: "Maryland", country: "United States", lat: 38.978, lng: -76.485, phone: "+1 410-263-7973", maxLengthM: 28, depthM: 4 },
  { id: "us-miami", name: "Miami Beach Marina", harbour: "Miami Beach", region: "Florida", country: "United States", lat: 25.77, lng: -80.135, phone: "+1 305-673-6000", maxLengthM: 70, depthM: 8 },
  { id: "us-charleston", name: "Charleston City Marina", harbour: "Charleston", region: "South Carolina", country: "United States", lat: 32.78, lng: -79.925, phone: "+1 843-723-8000", maxLengthM: 50, depthM: 7 },
  { id: "us-san-diego", name: "Sheraton Marina", harbour: "San Diego", region: "California", country: "United States", lat: 32.715, lng: -117.225, phone: "+1 619-291-8011", maxLengthM: 40, depthM: 6 },
  { id: "us-seattle", name: "Bell Harbor Marina", harbour: "Seattle", region: "Washington", country: "United States", lat: 47.605, lng: -122.355, phone: "+1 206-787-3952", maxLengthM: 35, depthM: 6 },
  { id: "ca-vancouver", name: "Coal Harbour Marina", harbour: "Vancouver", region: "British Columbia", country: "Canada", lat: 49.295, lng: -123.125, phone: "+1 604-681-2244", maxLengthM: 40, depthM: 6 },
  { id: "ca-halifax", name: "Alderney Landing Marina", harbour: "Dartmouth", region: "Nova Scotia", country: "Canada", lat: 44.67, lng: -63.565, phone: "+1 902-461-6432", maxLengthM: 25, depthM: 5 },
  { id: "bs-nassau", name: "Nassau Yacht Haven", harbour: "Nassau", region: "New Providence", country: "Bahamas", lat: 25.078, lng: -77.345, phone: "+1 242-322-1616", maxLengthM: 45, depthM: 6 },
  { id: "tt-chaguaramas", name: "Crews Inn Marina", harbour: "Chaguaramas", region: "Trinidad", country: "Trinidad and Tobago", lat: 10.685, lng: -61.635, phone: "+1 868-634-4334", maxLengthM: 40, depthM: 6 },
  { id: "ky-george-town", name: "Barcadere Marina", harbour: "George Town", region: "Grand Cayman", country: "Cayman Islands", lat: 19.295, lng: -81.365, phone: "+1 345-640-5555", maxLengthM: 35, depthM: 5 },
  { id: "bz-san-pedro", name: "San Pedro Marina", harbour: "San Pedro", region: "Ambergris Caye", country: "Belize", lat: 17.915, lng: -87.965, phone: "+501 226 3596", maxLengthM: 22, depthM: 4 },
  { id: "pa-colon", name: "Shelter Bay Marina", harbour: "Colón", region: "Colón", country: "Panama", lat: 9.365, lng: -79.945, phone: "+507 433-6662", maxLengthM: 50, depthM: 7 },
  { id: "br-rio", name: "Marina da Glória", harbour: "Rio de Janeiro", region: "Rio de Janeiro", country: "Brazil", lat: -22.915, lng: -43.175, phone: "+55 21 2555 2200", maxLengthM: 40, depthM: 6 },
  // ——— Pacific & Indian Ocean ———
  { id: "au-sydney", name: "Darling Harbour Marina", harbour: "Sydney", region: "New South Wales", country: "Australia", lat: -33.875, lng: 151.195, phone: "+61 2 9211 5111", maxLengthM: 45, depthM: 6 },
  { id: "au-brisbane", name: "Rivergate Marina", harbour: "Brisbane", region: "Queensland", country: "Australia", lat: -27.445, lng: 153.105, phone: "+61 7 3907 9000", maxLengthM: 50, depthM: 7 },
  { id: "au-fremantle", name: "Fremantle Sailing Club", harbour: "Fremantle", region: "Western Australia", country: "Australia", lat: -32.055, lng: 115.745, phone: "+61 8 9435 8800", maxLengthM: 35, depthM: 6 },
  { id: "nz-auckland", name: "Westhaven Marina", harbour: "Auckland", region: "Auckland", country: "New Zealand", lat: -36.84, lng: 174.745, phone: "+64 9 360 5536", maxLengthM: 50, depthM: 7 },
  { id: "nz-wellington", name: "Chaffers Marina", harbour: "Wellington", region: "Wellington", country: "New Zealand", lat: -41.285, lng: 174.78, phone: "+64 4 499 8888", maxLengthM: 28, depthM: 5 },
  { id: "za-cape-town", name: "V&A Waterfront Marina", harbour: "Cape Town", region: "Western Cape", country: "South Africa", lat: -33.905, lng: 18.42, phone: "+27 21 408 7600", maxLengthM: 45, depthM: 7 },
  { id: "mu-mauritius", name: "La Balise Marina", harbour: "Black River", region: "Rivière Noire", country: "Mauritius", lat: -20.365, lng: 57.365, phone: "+230 483 8080", maxLengthM: 35, depthM: 6 },
  { id: "sc-eden", name: "Eden Island Marina", harbour: "Mahé", region: "Mahé", country: "Seychelles", lat: -4.635, lng: 55.445, phone: "+248 4 671 000", maxLengthM: 60, depthM: 8 },
  { id: "th-phuket", name: "Boat Lagoon Marina", harbour: "Phuket", region: "Phuket", country: "Thailand", lat: 7.995, lng: 98.405, phone: "+66 76 239 055", maxLengthM: 40, depthM: 6 },
  { id: "my-langkawi", name: "Telaga Harbour Marina", harbour: "Langkawi", region: "Kedah", country: "Malaysia", lat: 6.355, lng: 99.685, phone: "+60 4 959 3500", maxLengthM: 35, depthM: 6 },
  { id: "sg-singapore", name: "ONE°15 Marina", harbour: "Singapore", region: "Singapore", country: "Singapore", lat: 1.245, lng: 103.845, phone: "+65 6305 6982", maxLengthM: 80, depthM: 8 },
  { id: "jp-yokohama", name: "Yokohama Bayside Marina", harbour: "Yokohama", region: "Kanagawa", country: "Japan", lat: 35.455, lng: 139.645, phone: "+81 45 900 2540", maxLengthM: 40, depthM: 6 },
  { id: "kr-busan", name: "Busan Yachting Center", harbour: "Busan", region: "Yeongdo", country: "South Korea", lat: 35.075, lng: 129.045, phone: "+82 51 419 4751", maxLengthM: 30, depthM: 5 },
  { id: "tw-keelung", name: "Keelung Marina", harbour: "Keelung", region: "Taiwan", country: "Taiwan", lat: 25.155, lng: 121.745, phone: "+886 2 2426 3366", maxLengthM: 28, depthM: 5 },
  { id: "ae-dubai", name: "Dubai Marina Yacht Club", harbour: "Dubai", region: "Dubai", country: "United Arab Emirates", lat: 25.075, lng: 55.135, phone: "+971 4 362 7900", maxLengthM: 90, depthM: 8 },
  { id: "il-herzliya", name: "Herzliya Marina", harbour: "Herzliya", region: "Tel Aviv", country: "Israel", lat: 32.165, lng: 34.795, phone: "+972 9 959 0565", maxLengthM: 40, depthM: 6 },
  // ——— More Europe ———
  { id: "be-ostend", name: "Mercator Marina", harbour: "Ostend", region: "West Flanders", country: "Belgium", lat: 51.225, lng: 2.925, phone: "+32 59 800 086", maxLengthM: 22, depthM: 4 },
  { id: "es-gibraltar", name: "Ocean Village Marina", harbour: "Gibraltar", region: "Gibraltar", country: "Gibraltar", lat: 36.135, lng: -5.355, phone: "+350 200 456 00", maxLengthM: 45, depthM: 7 },
  { id: "tn-tunis", name: "Sidi Bou Said Marina", harbour: "Tunis", region: "Tunis", country: "Tunisia", lat: 36.875, lng: 10.345, phone: "+216 71 740 066", maxLengthM: 30, depthM: 5 },
  { id: "eg-hurghada", name: "Hurghada Marina", harbour: "Hurghada", region: "Red Sea", country: "Egypt", lat: 27.255, lng: 33.815, phone: "+20 65 346 0500", maxLengthM: 35, depthM: 6 },
  { id: "al-saranda", name: "Porto Saranda", harbour: "Sarandë", region: "Vlorë", country: "Albania", lat: 39.875, lng: 20.005, phone: "+355 69 20 44 444", maxLengthM: 25, depthM: 5 },
  { id: "is-reykjavik", name: "Skarfabakki Marina", harbour: "Reykjavík", region: "Capital Region", country: "Iceland", lat: 64.155, lng: -21.785, phone: "+354 525 8600", maxLengthM: 28, depthM: 6 },
  { id: "fi-helsinki", name: "Helsinki Guest Harbour", harbour: "Helsinki", region: "Uusimaa", country: "Finland", lat: 60.165, lng: 24.965, phone: "+358 9 310 33 213", maxLengthM: 30, depthM: 5 },
  { id: "ee-tallinn", name: "Pirita Marina", harbour: "Tallinn", region: "Harju", country: "Estonia", lat: 59.455, lng: 24.825, phone: "+372 6 40 9438", maxLengthM: 25, depthM: 5 },
  { id: "lv-riga", name: "Andrejsala Marina", harbour: "Riga", region: "Riga", country: "Latvia", lat: 56.975, lng: 24.095, phone: "+371 67 328 000", maxLengthM: 22, depthM: 4 },
];

type Out = {
  id: string;
  name: string;
  harbour: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
  priceFromEur: number;
  maxLengthM: number;
  depthM: number;
  facilities: string[];
  description: string;
  phone: string;
};

const full: Out[] = seeds.map((s) => ({
  id: s.id,
  name: s.name,
  harbour: s.harbour,
  region: s.region,
  country: s.country,
  lat: s.lat,
  lng: s.lng,
  priceFromEur: s.priceFromEur ?? 45,
  maxLengthM: s.maxLengthM ?? 24,
  depthM: s.depthM ?? 5,
  facilities: s.facilities ?? [...DEFAULT_FACILITIES],
  description:
    s.description ??
    `${s.name} (${s.harbour}, ${s.country}) — confirm berth availability, depth, and tariffs with the marina office.`,
  phone: s.phone ?? "",
}));

const outPath = path.join(process.cwd(), "data", "marinas-world.json");
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(full, null, 2)}\n`);
console.log(`Wrote ${full.length} marinas → ${outPath}`);
