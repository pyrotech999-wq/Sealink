import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { MAP_PRESENCE_COOKIE, MAP_PRESENCE_COOKIE_MAX_AGE } from "@/lib/map-nearby-constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolvePresenceSession(): Promise<{ id: string; cookieFresh: boolean }> {
  const jar = await cookies();
  const raw = jar.get(MAP_PRESENCE_COOKIE)?.value?.trim() ?? "";
  if (raw && UUID_RE.test(raw)) return { id: raw, cookieFresh: false };
  return { id: randomUUID(), cookieFresh: true };
}

export function applyPresenceCookie(res: NextResponse, id: string): void {
  res.cookies.set(MAP_PRESENCE_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: MAP_PRESENCE_COOKIE_MAX_AGE,
  });
}
