import type { Metadata } from "next";
import ChartsSwitcher from "./ChartsSwitcher";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Navigation Charts",
  description:
    "Upload and preview your own KAP/BSB raster charts — parse header, decode raster, and view on a map with georeference bounds.",
};

export default function NavigationChartsPage() {
  return <ChartsSwitcher />;
}
