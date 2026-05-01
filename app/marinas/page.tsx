import type { Metadata } from "next";
import { MarinaBookingsClient } from "./MarinaBookingsClient";

export const metadata: Metadata = {
  title: "Marina berths",
  description: "Search marinas, compare facilities, and draft berth enquiries on SeaLink",
};

export default function MarinasPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <MarinaBookingsClient />
    </div>
  );
}
