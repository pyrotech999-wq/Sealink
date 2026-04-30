import type { Metadata } from "next";
import { IfmClientWrapper } from "@/app/ifm/IfmClientWrapper";

export const metadata: Metadata = {
  title: "IFM — International Friends Map",
  description: "International Friends Map on SeaLink",
};

export default function IfmPage() {
  return <IfmClientWrapper />;
}
