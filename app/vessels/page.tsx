import type { Metadata } from "next";
import { VesselClassifiedsClient } from "./VesselClassifiedsClient";

export const metadata: Metadata = {
  title: "Vessel classifieds",
  description: "Paid vessel classifieds on SeaLink",
};

export default function VesselsPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <VesselClassifiedsClient />
    </div>
  );
}
