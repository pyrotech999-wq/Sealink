import { requireAuthUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { GEAR_SELLER_COOKIE } from "@/lib/gear-constants";

export async function requireGearUser(): Promise<{ uid: string; email: string; isAdmin: boolean }> {
  const u = await requireAuthUser();
  return { uid: u.uid, email: u.email, isAdmin: u.isAdmin };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getLegacyGearUid(): Promise<string | null> {
  try {
    const jar = await cookies();
    const raw = jar.get(GEAR_SELLER_COOKIE)?.value?.trim() ?? "";
    if (raw && UUID_RE.test(raw)) return raw;
    return null;
  } catch {
    return null;
  }
}
