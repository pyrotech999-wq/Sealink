import type { Metadata } from "next";
import GearSwitcher from "./GearSwitcher";

export const metadata: Metadata = {
  title: "Boat gear — buy & sell",
  description: "Buy and sell boat equipment, spares, and kit on SeaLink — not boats.",
};

export default function GearPage() {
  return <GearSwitcher />;
}
