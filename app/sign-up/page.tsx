import type { Metadata } from "next";
import SignUpSwitcher from "./SignUpSwitcher";

export const metadata: Metadata = {
  title: "Create account | SeaLink",
  description: "Join SeaLink — family-style location sharing, circle invites, and safety preferences",
};

export default function SignUpPage() {
  return <SignUpSwitcher />;
}

