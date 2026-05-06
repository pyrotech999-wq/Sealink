declare module "esri-leaflet" {
  import type { Layer } from "leaflet";

  export interface DynamicMapLayerOptions {
    url: string;
    opacity?: number;
    useCors?: boolean;
    layers?: number[];
  }

  /** ArcGIS dynamic map service as a Leaflet layer (NOAA ENC MapServer, etc.). */
  export function dynamicMapLayer(options: DynamicMapLayerOptions): Layer;
}
