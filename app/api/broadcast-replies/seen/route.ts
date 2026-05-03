import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { markBroadcastReplyThreadSeen } from "@/lib/broadcast-reply-store";

export const runtime = "nodejs";

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

type Body = { broadcastId?: unknown; lat?: unknown; lng?: unknown };

export async function POST(req: Request): Promise<Response> {
  let viewerUid: string;
  try {
    viewerUid = (await requireAuthUser()).uid;
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const broadcastId = typeof body.broadcastId === "string" ? body.broadcastId.trim() : "";
  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  const coords = clampLatLng(lat, lng);
  if (!broadcastId || !coords) {
    return NextResponse.json({ error: "broadcastId, lat, and lng required" }, { status: 400 });
  }

  try {
    const out = await markBroadcastReplyThreadSeen(viewerUid, broadcastId, coords.lat, coords.lng);
    if (!out.ok) {
      const status = out.error.includes("not found") ? 404 : out.error.includes("cannot") ? 403 : 400;
      return NextResponse.json({ error: out.error }, { status });
    }
    return NextResponse.json({ ok: true as const });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update seen state";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
