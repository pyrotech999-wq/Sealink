export type FaxSourceId = "dwd" | "opc";

export type FaxChartTypeId = "wave_height_direction" | "sea_state" | "wind_wave" | "surface_pressure";

export type FaxRegionId =
  | "dwd_north_sea"
  | "dwd_baltic_sea"
  | "dwd_east_atlantic"
  | "dwd_med_west"
  | "dwd_med_east"
  | "opc_atlantic"
  | "opc_pacific"
  | "opc_arctic";

export type FaxChartType = { id: FaxChartTypeId; label: string };
export type FaxRegion = { id: FaxRegionId; label: string; source: FaxSourceId };

export const FAX_CHART_TYPES: FaxChartType[] = [
  { id: "wave_height_direction", label: "Wave height & direction" },
  { id: "sea_state", label: "Sea state" },
  { id: "wind_wave", label: "Wind/wave forecast" },
  { id: "surface_pressure", label: "Surface pressure" },
];

export const FAX_REGIONS: FaxRegion[] = [
  { id: "dwd_north_sea", label: "Europe · North Sea", source: "dwd" },
  { id: "dwd_baltic_sea", label: "Europe · Baltic Sea", source: "dwd" },
  { id: "dwd_east_atlantic", label: "Europe · East Atlantic", source: "dwd" },
  { id: "dwd_med_west", label: "Europe · Med (west)", source: "dwd" },
  { id: "dwd_med_east", label: "Europe · Med (east)", source: "dwd" },
  { id: "opc_atlantic", label: "OPC · Atlantic", source: "opc" },
  { id: "opc_pacific", label: "OPC · Pacific", source: "opc" },
  { id: "opc_arctic", label: "OPC · Alaska/Arctic", source: "opc" },
];

export function regionsForSource(source: FaxSourceId): FaxRegion[] {
  return FAX_REGIONS.filter((r) => r.source === source);
}

export function chartTypesForSource(source: FaxSourceId): FaxChartTypeId[] {
  if (source === "dwd") {
    // DWD provides sea-state charts (wave height + direction etc) at 0/24/48/72.
    return ["wave_height_direction", "sea_state"];
  }
  // OPC provides classic analysis + 24/48/72/96 for surface pressure and wind/wave products.
  return ["wind_wave", "sea_state", "surface_pressure", "wave_height_direction"];
}

export function availableHours(source: FaxSourceId, chartType: FaxChartTypeId): number[] {
  if (source === "dwd") return [0, 24, 48, 72];
  // OPC: analysis is handled as hour=0 with chartType mapping; plus 24/48/72/96.
  if (chartType === "surface_pressure" || chartType === "wind_wave" || chartType === "sea_state" || chartType === "wave_height_direction") {
    return [0, 24, 48, 72, 96];
  }
  return [0, 24, 48, 72, 96];
}

export function getRegion(id: FaxRegionId): FaxRegion {
  const r = FAX_REGIONS.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown fax region: ${id}`);
  return r;
}

