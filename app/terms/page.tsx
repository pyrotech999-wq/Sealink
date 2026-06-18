import type { Metadata } from "next";
import TermsSwitcher from "./TermsSwitcher";

export const metadata: Metadata = {
  title: "Terms of use | SeaLink",
  description:
    "Terms of use for SeaLink: recreational and entertainment use only; not for voyage planning, navigation, or emergency.",
};

export default function TermsPage() {
  return <TermsSwitcher />;
}
