export type WeatherChartRegionId =
  | "europe"
  | "north-america"
  | "south-america"
  | "africa"
  | "eastern-asia"
  | "southern-asia"
  | "australia"
  | "middle-america"
  | "central-europe"
  | "scandinavia"
  | "netherlands"
  | "france"
  | "italy-balkans"
  | "spain"
  | "turkey-middle-east"
  | "united-kingdom"
  | "eastern-europe";

export type WeatherChartRegion = {
  id: WeatherChartRegionId;
  label: string;
  bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number };
  /** Grid spacing in degrees for sampling Open-Meteo. */
  stepDeg: number;
  /** Leaflet [[south, west], [north, east]] for fitBounds / default framing. */
  mapBounds: [[number, number], [number, number]];
};

export const WEATHER_CHART_REGIONS: WeatherChartRegion[] = [
  {
    id: "europe",
    label: "Europe",
    bbox: { latMin: 35, lonMin: -12, latMax: 72, lonMax: 35 },
    stepDeg: 1.25,
    mapBounds: [
      [35, -12],
      [72, 35],
    ],
  },
  {
    id: "north-america",
    label: "North America",
    bbox: { latMin: 15, lonMin: -170, latMax: 72, lonMax: -50 },
    stepDeg: 6.0,
    mapBounds: [
      [15, -170],
      [72, -50],
    ],
  },
  {
    id: "south-america",
    label: "South America",
    bbox: { latMin: -56, lonMin: -82, latMax: 14, lonMax: -34 },
    stepDeg: 6.0,
    mapBounds: [
      [-56, -82],
      [14, -34],
    ],
  },
  {
    id: "africa",
    label: "Africa",
    bbox: { latMin: -35, lonMin: -20, latMax: 37, lonMax: 55 },
    stepDeg: 6.0,
    mapBounds: [
      [-35, -20],
      [37, 55],
    ],
  },
  {
    id: "eastern-asia",
    label: "Eastern Asia",
    bbox: { latMin: 5, lonMin: 90, latMax: 60, lonMax: 160 },
    stepDeg: 6.0,
    mapBounds: [
      [5, 90],
      [60, 160],
    ],
  },
  {
    id: "southern-asia",
    label: "Southern Asia",
    bbox: { latMin: -5, lonMin: 55, latMax: 40, lonMax: 105 },
    stepDeg: 5.0,
    mapBounds: [
      [-5, 55],
      [40, 105],
    ],
  },
  {
    id: "australia",
    label: "Australia",
    bbox: { latMin: -46, lonMin: 110, latMax: -8, lonMax: 155 },
    stepDeg: 5.0,
    mapBounds: [
      [-46, 110],
      [-8, 155],
    ],
  },
  {
    id: "middle-america",
    label: "Middle America",
    bbox: { latMin: 5, lonMin: -120, latMax: 35, lonMax: -60 },
    stepDeg: 5.0,
    mapBounds: [
      [5, -120],
      [35, -60],
    ],
  },

  // Regional Europe presets (matches WZ “Regional” list; approximated bboxes).
  {
    id: "central-europe",
    label: "Central Europe",
    bbox: { latMin: 45, lonMin: 2, latMax: 56, lonMax: 22 },
    stepDeg: 1.15,
    mapBounds: [
      [45, 2],
      [56, 22],
    ],
  },
  {
    id: "scandinavia",
    label: "Scandinavia",
    bbox: { latMin: 54, lonMin: 4, latMax: 72, lonMax: 32 },
    stepDeg: 2.2,
    mapBounds: [
      [54, 4],
      [72, 32],
    ],
  },
  {
    id: "netherlands",
    label: "Netherlands",
    bbox: { latMin: 50.5, lonMin: 2.5, latMax: 54, lonMax: 8 },
    stepDeg: 0.35,
    mapBounds: [
      [50.5, 2.5],
      [54, 8],
    ],
  },
  {
    id: "france",
    label: "France",
    bbox: { latMin: 41, lonMin: -6, latMax: 52, lonMax: 10 },
    stepDeg: 1.3,
    mapBounds: [
      [41, -6],
      [52, 10],
    ],
  },
  {
    id: "italy-balkans",
    label: "Italy / Balkans",
    bbox: { latMin: 35, lonMin: 8, latMax: 48, lonMax: 28 },
    stepDeg: 1.6,
    mapBounds: [
      [35, 8],
      [48, 28],
    ],
  },
  {
    id: "spain",
    label: "Spain",
    bbox: { latMin: 35, lonMin: -11, latMax: 45, lonMax: 5 },
    stepDeg: 1.4,
    mapBounds: [
      [35, -11],
      [45, 5],
    ],
  },
  {
    id: "turkey-middle-east",
    label: "Turkey / Middle East",
    bbox: { latMin: 20, lonMin: 25, latMax: 45, lonMax: 60 },
    stepDeg: 2.2,
    mapBounds: [
      [20, 25],
      [45, 60],
    ],
  },
  {
    id: "united-kingdom",
    label: "United Kingdom",
    bbox: { latMin: 49.5, lonMin: -11, latMax: 60.8, lonMax: 3 },
    stepDeg: 0.45,
    mapBounds: [
      [49.5, -11],
      [60.8, 3],
    ],
  },
  {
    id: "eastern-europe",
    label: "Eastern Europe",
    bbox: { latMin: 42, lonMin: 16, latMax: 60, lonMax: 42 },
    stepDeg: 2.0,
    mapBounds: [
      [42, 16],
      [60, 42],
    ],
  },
];

export function getWeatherChartRegion(id: WeatherChartRegionId): WeatherChartRegion {
  const r = WEATHER_CHART_REGIONS.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown region: ${id}`);
  return r;
}

export function buildRegionGrid(region: WeatherChartRegion): { lats: number[]; lons: number[]; points: { lat: number; lon: number }[] } {
  const { latMin, latMax, lonMin, lonMax } = region.bbox;
  const step = region.stepDeg;
  const points: { lat: number; lon: number }[] = [];
  const lats: number[] = [];
  const lons: number[] = [];

  for (let lat = latMin; lat <= latMax + 1e-9; lat += step) lats.push(Number(lat.toFixed(4)));
  for (let lon = lonMin; lon <= lonMax + 1e-9; lon += step) lons.push(Number(lon.toFixed(4)));

  for (const lat of lats) {
    for (const lon of lons) {
      points.push({ lat, lon });
    }
  }

  return { lats, lons, points };
}

const MAX_SAMPLE_POINTS = 520;

/** Cap grid size for Open-Meteo multi-location limits and payload size. */
export function buildRegionGridCapped(region: WeatherChartRegion): { points: { lat: number; lon: number }[] } {
  const { points } = buildRegionGrid(region);
  if (points.length <= MAX_SAMPLE_POINTS) return { points };
  const stride = Math.ceil(points.length / MAX_SAMPLE_POINTS);
  const out: { lat: number; lon: number }[] = [];
  for (let i = 0; i < points.length; i += stride) out.push(points[i]!);
  return { points: out.slice(0, MAX_SAMPLE_POINTS) };
}

