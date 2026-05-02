import { cookies } from "next/headers";
import { createHash } from "crypto";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";
import { normaliseEmail } from "@/lib/email-normalise";
import { isReservedOwner } from "@/lib/reserved-admin";

export { normaliseEmail };
export const AUTH_EMAIL_COOKIE = "sealink_email";

/** Default when `SEALINK_ADMIN_EMAIL` unset — same as {@link RESERVED_OWNER_EMAIL} in reserved-admin. */
const DEFAULT_ADMIN = "pyrotech999@hotmail.co.uk";

export type AuthUser = {
  email: string;
  uid: string;
  isAdmin: boolean;
};

export function uidFromEmail(email: string): string {
  // Stable opaque id for ownership checks; not intended as a secure identifier.
  return createHash("sha256").update(normaliseEmail(email)).digest("hex").slice(0, 32);
}

export function isAdminEmail(email: string): boolean {
  const admin = normaliseEmail(process.env.SEALINK_ADMIN_EMAIL ?? DEFAULT_ADMIN);
  return normaliseEmail(email) === admin;
}

/** Area broadcast “all regions” — only this sign-in email may create (default: pyrotech999@hotmail.co.uk). */
export function canSendGlobalAreaBroadcast(email: string): boolean {
  const allowed = normaliseEmail(process.env.SEALINK_GLOBAL_BROADCAST_EMAIL ?? DEFAULT_ADMIN);
  return normaliseEmail(email) === allowed;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const hasDemo = jar.get(DEMO_SESSION_COOKIE)?.value === DEMO_SESSION_VALUE;
  if (!hasDemo) return null;

  const raw = jar.get(AUTH_EMAIL_COOKIE)?.value ?? "";
  const email = normaliseEmail(raw);
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const uid = uidFromEmail(email);
  const isAdmin = isAdminEmail(email) || (await isReservedOwner(email, uid));
  return { email, uid, isAdmin };
}

export async function requireAuthUser(): Promise<AuthUser> {
  const u = await getAuthUser();
  if (!u) throw new Error("AUTH_REQUIRED");
  return u;
}

