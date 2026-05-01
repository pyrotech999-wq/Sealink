import { NextResponse } from "next/server";
import { applyPresenceCookie, resolvePresenceSession } from "@/lib/map-presence-api-helpers";
import { appendBroadcast, deleteBroadcast, listBroadcastsNear } from "@/lib/map-broadcast-store";
import { canSendGlobalAreaBroadcast, getAuthUser, requireAuthUser } from "@/lib/auth";

export const runtime = "nodejs";

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function sanitizeBody(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, 500);
}

export async function GET(req: Request) {
  try {
    const { id: viewerId, cookieFresh } = await resolvePresenceSession();
    const viewer = await getAuthUser();
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const coords = clampLatLng(lat, lng);
    if (!coords) {
      return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    }

    const messages = await listBroadcastsNear(coords.lat, coords.lng, viewer?.uid ?? null, viewer?.isAdmin ?? false);

    const res = NextResponse.json({ messages });
    if (cookieFresh) applyPresenceCookie(res, viewerId);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load broadcasts";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PostBody = { lat?: unknown; lng?: unknown; text?: unknown; broadcastAllAreas?: unknown };

export async function POST(req: Request) {
  const { id: presenceId, cookieFresh } = await resolvePresenceSession();
  let authorUid: string;
  let authorEmail: string;
  try {
    const u = await requireAuthUser();
    authorUid = u.uid;
    authorEmail = u.email;
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const broadcastAllAreas = body.broadcastAllAreas === true;
  if (broadcastAllAreas && !canSendGlobalAreaBroadcast(authorEmail)) {
    return NextResponse.json({ error: "Global broadcasts are not allowed for this account." }, { status: 403 });
  }

  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  const coords = clampLatLng(lat, lng);
  if (!coords) {
    return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
  }

  const rawText = typeof body.text === "string" ? body.text : "";
  const text = sanitizeBody(rawText);
  if (text.length < 1) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }

  const out = await appendBroadcast(authorUid, coords.lat, coords.lng, text, { isGlobal: broadcastAllAreas });
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: 429 });
  }

  const res = NextResponse.json({ ok: true as const, id: out.id });
  if (cookieFresh) applyPresenceCookie(res, presenceId);
  return res;
}

type DeleteBody = { id?: unknown };

export async function DELETE(req: Request) {
  let u: { uid: string; isAdmin: boolean };
  try {
    const au = await requireAuthUser();
    u = { uid: au.uid, isAdmin: au.isAdmin };
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const out = await deleteBroadcast(id, u.uid, u.isAdmin);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.error === "Not allowed" ? 403 : 404 });
  return NextResponse.json({ ok: true as const });
}
