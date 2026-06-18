import type { Metadata } from "next";
import PrivacySwitcher from "./PrivacySwitcher";

export const metadata: Metadata = {
  title: "Privacy policy | SeaLink",
  description:
    "How SeaLink collects, uses, stores, and shares personal data — cookies, maps, accounts, payments, and your rights.",
};

export default function PrivacyPage() {
  return <PrivacySwitcher />;
}
