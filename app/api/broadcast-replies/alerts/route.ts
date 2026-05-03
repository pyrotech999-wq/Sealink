import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { listUnreadBroadcastReplyAlerts } from "@/lib/broadcast-reply-store";

export const runtime = "nodejs";

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export async function GET(req: Request): Promise<Response> {
  const user = await getAuthUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const coords = clampLatLng(lat, lng);
  if (!coords) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  try {
    const alerts = await listUnreadBroadcastReplyAlerts(user.uid, coords.lat, coords.lng, user.isAdmin);
    return NextResponse.json({ ok: true as const, alerts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load alerts";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
