import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { GEAR_SELLER_COOKIE, GEAR_SELLER_COOKIE_MAX_AGE } from "@/lib/gear-constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolveSellerUid(): Promise<{ uid: string; cookieFresh: boolean }> {
  const jar = await cookies();
  const raw = jar.get(GEAR_SELLER_COOKIE)?.value?.trim() ?? "";
  if (raw && UUID_RE.test(raw)) return { uid: raw, cookieFresh: false };
  return { uid: randomUUID(), cookieFresh: true };
}

export function applySellerCookie(res: NextResponse, uid: string): void {
  res.cookies.set(GEAR_SELLER_COOKIE, uid, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: GEAR_SELLER_COOKIE_MAX_AGE,
  });
}
