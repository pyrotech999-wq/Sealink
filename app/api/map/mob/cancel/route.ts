import { NextResponse } from "next/server";
import { applyPresenceCookie, resolvePresenceSession } from "@/lib/map-presence-api-helpers";
import { appendBroadcast } from "@/lib/map-broadcast-store";
import { requireAuthUser } from "@/lib/auth";
import { normalisePhone } from "@/lib/phone-normalise";
import { MAP_MOB_BODY_MAX, MOB_CANCEL_BROADCAST_INTRO } from "@/lib/map-broadcast-constants";

export const runtime = "nodejs";

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function sanitizeLine(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

type PostBody = {
  lat?: unknown;
  lng?: unknown;
  fullName?: unknown;
  boatName?: unknown;
  phone?: unknown;
};

export async function POST(req: Request) {
  const { id: presenceId, cookieFresh } = await resolvePresenceSession();
  let u: { uid: string; email: string };
  try {
    u = await requireAuthUser();
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  const coords = clampLatLng(lat, lng);
  if (!coords) {
    return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
  }

  const fullName = sanitizeLine(body.fullName, 80);
  const boatName = sanitizeLine(body.boatName, 80);
  const phone = sanitizeLine(body.phone, 40);
  const phoneNorm = normalisePhone(phone);
  const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${coords.lat},${coords.lng}`)}`;

  const cancelBodyRaw = `${MOB_CANCEL_BROADCAST_INTRO}

This cancels a man overboard alert from this vessel. Person secure — emergency no longer active.

Sender location when this message was sent (WGS84, decimal degrees):
Latitude: ${coords.lat.toFixed(6)}
Longitude: ${coords.lng.toFixed(6)}
Position (decimal): ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}
Open map: ${mapsUrl}

Name: ${fullName || "—"}
Boat: ${boatName || "—"}
Email: ${u.email}
Phone: ${phoneNorm || phone || "—"}

Time (UTC): ${new Date().toISOString()}`;

  const cancelBody = cancelBodyRaw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, MAP_MOB_BODY_MAX);
  if (cancelBody.length < 1) {
    return NextResponse.json({ error: "Could not build cancellation message." }, { status: 400 });
  }

  const out = await appendBroadcast(u.uid, coords.lat, coords.lng, cancelBody, { wideAreaReach: true });
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: 429 });
  }

  const res = NextResponse.json({ ok: true as const, id: out.id });
  if (cookieFresh) applyPresenceCookie(res, presenceId);
  return res;
}
