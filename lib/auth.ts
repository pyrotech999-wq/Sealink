import { cookies } from "next/headers";
import { createHash } from "crypto";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";

export const AUTH_EMAIL_COOKIE = "sealink_email";

const DEFAULT_ADMIN = "pyrotech999@hotmail.co.uk";

export type AuthUser = {
  email: string;
  uid: string;
  isAdmin: boolean;
};

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function uidFromEmail(email: string): string {
  // Stable opaque id for ownership checks; not intended as a secure identifier.
  return createHash("sha256").update(normaliseEmail(email)).digest("hex").slice(0, 32);
}

export function isAdminEmail(email: string): boolean {
  const admin = normaliseEmail(process.env.SEALINK_ADMIN_EMAIL ?? DEFAULT_ADMIN);
  return normaliseEmail(email) === admin;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const hasDemo = jar.get(DEMO_SESSION_COOKIE)?.value === DEMO_SESSION_VALUE;
  if (!hasDemo) return null;

  const raw = jar.get(AUTH_EMAIL_COOKIE)?.value ?? "";
  const email = normaliseEmail(raw);
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  return { email, uid: uidFromEmail(email), isAdmin: isAdminEmail(email) };
}

export async function requireAuthUser(): Promise<AuthUser> {
  const u = await getAuthUser();
  if (!u) throw new Error("AUTH_REQUIRED");
  return u;
}

