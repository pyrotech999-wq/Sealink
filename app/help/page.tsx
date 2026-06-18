import type { Metadata } from "next";
import HelpSwitcher from "./HelpSwitcher";

export const metadata: Metadata = {
  title: "Help | SeaLink",
  description:
    "How to use SeaLink: home map, Anchor alarm (geofence audio & alerts), sharing, Weather & sea, navigation charts & COLREGs, IFM, Messages (direct & area), Buy & Sell, marinas, broadcasts, MOB, sponsors strip, PWA install, and more.",
};

export default function HelpPage() {
  return <HelpSwitcher />;
}
