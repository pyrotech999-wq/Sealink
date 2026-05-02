import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { AdminAccessClient } from "./AdminAccessClient";

export const metadata: Metadata = {
  title: "Admin — subscription access",
  robots: { index: false, follow: false },
};

export default async function AdminAccessPage() {
  const u = await getAuthUser();
  if (!u?.isAdmin) redirect("/");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <AdminAccessClient />
    </div>
  );
}
