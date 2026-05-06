export type OpcRegionId = "atlantic" | "pacific" | "arctic";

export type OpcTimelineKey = "analysis" | "24h" | "48h" | "72h" | "96h";

export type OpcChartFamilyId = "surface" | "wind_wave" | "wave_period" | "mb500";

export type OpcChartFamily = {
  id: OpcChartFamilyId;
  label: string;
  /** Maps to OPC "product" ids used under /Loops/<product>/image_*.gif */
  productsByTimeline: Partial<Record<OpcTimelineKey, string>>;
};

export type OpcRegion = {
  id: OpcRegionId;
  label: string;
  /** Used for the Product Loops page: ?category=<category> */
  opcCategory: "atlantic" | "pacific" | "arctic";
  families: OpcChartFamily[];
};

export const OPC_TIMELINES: { key: OpcTimelineKey; label: string }[] = [
  { key: "analysis", label: "Analysis" },
  { key: "24h", label: "24h" },
  { key: "48h", label: "48h" },
  { key: "72h", label: "72h" },
  { key: "96h", label: "96h" },
];

export const OPC_REGIONS: OpcRegion[] = [
  {
    id: "atlantic",
    label: "Atlantic",
    opcCategory: "atlantic",
    families: [
      {
        id: "surface",
        label: "Surface pressure",
        productsByTimeline: {
          analysis: "atlsfcf00",
          "24h": "atlsfcf24",
          "48h": "atlsfcf48",
          "72h": "atlsfcf72",
          "96h": "atlsfcf96",
        },
      },
      {
        id: "wind_wave",
        label: "Wind & wave",
        productsByTimeline: {
          analysis: "atlwwf00",
          "24h": "atlwwf24",
          "48h": "atlwwf48",
          "72h": "atlwwf72",
          "96h": "atlwwf96",
        },
      },
      {
        id: "wave_period",
        label: "Wave period",
        productsByTimeline: {
          "24h": "atlwperf24",
          "48h": "atlwperf48",
          "72h": "atlwperf72",
          "96h": "atlwperf96",
        },
      },
      {
        id: "mb500",
        label: "500 mb",
        productsByTimeline: {
          analysis: "atl500f00",
          "24h": "atl500f24",
          "48h": "atl500f48",
          "72h": "atl500f72",
          "96h": "atl500f96",
        },
      },
    ],
  },
  {
    id: "pacific",
    label: "Pacific",
    opcCategory: "pacific",
    families: [
      {
        id: "surface",
        label: "Surface pressure",
        productsByTimeline: {
          analysis: "pacsfcf00",
          "24h": "pacsfcf24",
          "48h": "pacsfcf48",
          "72h": "pacsfcf72",
          "96h": "pacsfcf96",
        },
      },
      {
        id: "wind_wave",
        label: "Wind & wave",
        productsByTimeline: {
          analysis: "pacwwf00",
          "24h": "pacwwf24",
          "48h": "pacwwf48",
          "72h": "pacwwf72",
          "96h": "pacwwf96",
        },
      },
      {
        id: "wave_period",
        label: "Wave period",
        productsByTimeline: {
          "24h": "pacwperf24",
          "48h": "pacwperf48",
          "72h": "pacwperf72",
          "96h": "pacwperf96",
        },
      },
      {
        id: "mb500",
        label: "500 mb",
        productsByTimeline: {
          analysis: "pac500f00",
          "24h": "pac500f24",
          "48h": "pac500f48",
          "72h": "pac500f72",
          "96h": "pac500f96",
        },
      },
    ],
  },
  {
    id: "arctic",
    label: "Alaska / Arctic",
    opcCategory: "arctic",
    families: [
      {
        id: "surface",
        label: "Surface pressure",
        productsByTimeline: {
          analysis: "arcsfc",
          "24h": "arcsfcf24",
          "48h": "arcsfcf48",
          "72h": "arcsfcf72",
          "96h": "arcsfcf96",
        },
      },
      {
        id: "wind_wave",
        label: "Wind & wave",
        productsByTimeline: {
          "24h": "arcwwf24",
          "48h": "arcwwf48",
          "72h": "arcwwf72",
          "96h": "arcwwf96",
        },
      },
      {
        id: "wave_period",
        label: "Wave period",
        productsByTimeline: {
          "24h": "akwperf24",
          "48h": "akwperf48",
          "72h": "akwperf72",
          "96h": "akwperf96",
        },
      },
    ],
  },
];

export function getOpcRegion(id: OpcRegionId): OpcRegion {
  const r = OPC_REGIONS.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown OPC region: ${id}`);
  return r;
}

export function getOpcFamily(region: OpcRegion, familyId: OpcChartFamilyId): OpcChartFamily {
  const f = region.families.find((x) => x.id === familyId);
  if (!f) throw new Error(`Unknown OPC family: ${familyId}`);
  return f;
}

export function listAllOpcProducts(): Set<string> {
  const out = new Set<string>();
  for (const r of OPC_REGIONS) {
    for (const fam of r.families) {
      for (const p of Object.values(fam.productsByTimeline)) {
        if (typeof p === "string" && p.trim()) out.add(p);
      }
    }
  }
  return out;
}

