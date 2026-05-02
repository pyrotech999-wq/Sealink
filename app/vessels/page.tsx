import type { Metadata } from "next";
import { VesselClassifiedsClient } from "./VesselClassifiedsClient";

export const metadata: Metadata = {
  title: "Boats for sale",
  description: "Paid boat classifieds on SeaLink.",
};

export default function VesselsPage() {
  return (
    <div className="flex flex-1 flex-col bg-black">
      <VesselClassifiedsClient />
    </div>
  );
}
