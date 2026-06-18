// @/app/mob/page.tsx

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Man Overboard",
  description: "Details and cancellation for an active MOB alert.",
};

import MobClient from "@/components/mob/MobClient";

export default function MobPage() {
  return <MobClient />;
}


