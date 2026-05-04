import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { applyPresenceCookie, resolvePresenceSession } from "@/lib/map-presence-api-helpers";
import { logMapPresenceServer } from "@/lib/map-presence-server-log";
import {
  presenceAllowGet,
  presenceAllowPostUpsert,
  presenceThrottleKey,
} from "@/lib/map-presence-server-rate-limit";
import { findNearbyPeers, upsertPresence } from "@/lib/map-presence-store";

export const runtime = "nodejs";

/**
 * Emergency off-switch: `/api/map/presence` returns empty success payloads immediately (no auth, no throttle, no store).
 * Set to `false` and redeploy to restore nearby presence.
 */
const MAP_PRESENCE_EMERGENCY_OFF = true;

async function requirePresenceAuth(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const u = await getAuthUser().catch(() => null);
  if (!u) {
    logMapPresenceServer("reject", { reason: "unauthorized", note: "no-session" });
    return {
      ok: false,
      res: NextResponse.json({ error: "Sign in required." }, { status: 401 }),
    };
  }
  return { ok: true };
}

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

type PostBody = {
  lat?: unknown;
  lng?: unknown;
  label?: unknown;
  /** Ignored: avatars are not stored or returned (bandwidth). */
  avatarDataUrl?: unknown;
  shareNearby?: unknown;
};

export async function GET(req: Request) {
  if (MAP_PRESENCE_EMERGENCY_OFF) {
    return NextResponse.json({ peers: [], disabled: true as const });
  }

  const auth = await requirePresenceAuth();
  if (!auth.ok) return auth.res;

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
    logMapPresenceServer("GET-skipped", { reason: "server-throttle", keyKind: tkey.startsWith("s:") ? "session" : "ip" });
    const res = NextResponse.json({ peers: [], throttled: true as const });
    if (cookieFresh) applyPresenceCookie(res, id);
    return res;
  }

  const peersRaw = await findNearbyPeers(coords.lat, coords.lng, id);
  const peers = peersRaw.map((p) => ({
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    label: p.label,
    avatarDataUrl: "" as const,
  }));

  const res = NextResponse.json({ peers });
  if (cookieFresh) applyPresenceCookie(res, id);
  return res;
}

export async function POST(req: Request) {
  if (MAP_PRESENCE_EMERGENCY_OFF) {
    return NextResponse.json({ ok: true as const, disabled: true as const });
  }

  const auth = await requirePresenceAuth();
  if (!auth.ok) return auth.res;

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

  const tkey = presenceThrottleKey(id, cookieFresh, req);
  if (!presenceAllowPostUpsert(tkey)) {
    logMapPresenceServer("POST-upsert-skipped", { reason: "server-throttle", keyKind: tkey.startsWith("s:") ? "session" : "ip" });
    const res = NextResponse.json({ ok: true as const, rateLimited: true as const });
    if (cookieFresh) applyPresenceCookie(res, id);
    return res;
  }

  await upsertPresence(id, {
    lat: coords.lat,
    lng: coords.lng,
    label,
    avatarDataUrl: "",
    shareNearby: true,
  });

  const res = NextResponse.json({ ok: true as const });
  if (cookieFresh) applyPresenceCookie(res, id);
  return res;
}
