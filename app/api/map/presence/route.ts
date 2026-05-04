import { NextResponse } from "next/server";
import { applyPresenceCookie, resolvePresenceSession } from "@/lib/map-presence-api-helpers";
import {
  presenceAllowGet,
  presenceAllowPostUpsert,
  presenceThrottleKey,
} from "@/lib/map-presence-server-rate-limit";
import { findNearbyPeers, upsertPresence } from "@/lib/map-presence-store";

export const runtime = "nodejs";

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

type PostBody = {
  lat?: unknown;
  lng?: unknown;
  label?: unknown;
  avatarDataUrl?: unknown;
  shareNearby?: unknown;
};

export async function GET(req: Request) {
  const { id, cookieFresh } = await resolvePresenceSession();
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const coords = clampLatLng(lat, lng);
  if (!coords) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const tkey = presenceThrottleKey(id, cookieFresh, req);
  if (!presenceAllowGet(tkey)) {
    const res = NextResponse.json({ peers: [], throttled: true as const });
    if (cookieFresh) applyPresenceCookie(res, id);
    return res;
  }

  const peers = await findNearbyPeers(coords.lat, coords.lng, id);

  const res = NextResponse.json({ peers });
  if (cookieFresh) applyPresenceCookie(res, id);
  return res;
}

export async function POST(req: Request) {
  const { id, cookieFresh } = await resolvePresenceSession();

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shareNearby = body.shareNearby === true;

  if (!shareNearby) {
    await upsertPresence(id, {
      lat: 0,
      lng: 0,
      label: "",
      avatarDataUrl: "",
      shareNearby: false,
    });
    const res = NextResponse.json({ ok: true as const, removed: true as const });
    if (cookieFresh) applyPresenceCookie(res, id);
    return res;
  }

  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  const coords = clampLatLng(lat, lng);
  if (!coords) {
    return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
  }

  const labelRaw = typeof body.label === "string" ? body.label : "";
  const label = labelRaw.replace(/[\r\n]+/g, " ").trim().slice(0, 40) || "Nearby boat";
  const avatarRaw = typeof body.avatarDataUrl === "string" ? body.avatarDataUrl : "";
  const avatarDataUrl = avatarRaw.trim().slice(0, 450_000);

  const tkey = presenceThrottleKey(id, cookieFresh, req);
  if (!presenceAllowPostUpsert(tkey)) {
    const res = NextResponse.json({ ok: true as const, rateLimited: true as const });
    if (cookieFresh) applyPresenceCookie(res, id);
    return res;
  }

  await upsertPresence(id, {
    lat: coords.lat,
    lng: coords.lng,
    label,
    avatarDataUrl,
    shareNearby: true,
  });

  const res = NextResponse.json({ ok: true as const });
  if (cookieFresh) applyPresenceCookie(res, id);
  return res;
}
