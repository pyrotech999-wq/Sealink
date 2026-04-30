import { requireAuthUser } from "@/lib/auth";

export async function requireGearUser(): Promise<{ uid: string; email: string; isAdmin: boolean }> {
  const u = await requireAuthUser();
  return { uid: u.uid, email: u.email, isAdmin: u.isAdmin };
}
