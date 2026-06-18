import type { Metadata } from "next";
import SignInSwitcher from "./SignInSwitcher";

export const metadata: Metadata = {
  title: "Sign in | SeaLink",
  description: "Sign in to SeaLink",
};

export default function SignInPage() {
  return <SignInSwitcher />;
}

