import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { AdminSiteBannersClient } from "./AdminSiteBannersClient";

export const metadata: Metadata = {
  title: "Admin — site banner ads",
  robots: { index: false, follow: false },
};

export default async function AdminSiteBannersPage() {
  const u = await getAuthUser();
  if (!u?.isAdmin) redirect("/");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <AdminSiteBannersClient />
    </div>
  );
}
