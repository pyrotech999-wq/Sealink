import type { Metadata } from "next";
import { ColregsClient } from "@/components/colregs/ColregsClient";

export const metadata: Metadata = {
  title: "COLREGs",
  description:
    "Key COLREGs principles: responsibility, safe speed, give-way and stand-on actions, head-on, crossing, and overtaking.",
};

export default function ColregsPage() {
  return <ColregsClient />;
}

