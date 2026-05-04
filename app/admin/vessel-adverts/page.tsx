import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { AdminVesselAdvertsClient } from "./AdminVesselAdvertsClient";

export const metadata: Metadata = {
  title: "Admin — boat adverts & promo codes",
  robots: { index: false, follow: false },
};

export default async function AdminVesselAdvertsPage() {
  const u = await getAuthUser();
  if (!u?.isAdmin) redirect("/");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <AdminVesselAdvertsClient />
    </div>
  );
}
