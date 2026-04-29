import { NextResponse } from "next/server";
import { applyPresenceCookie, resolvePresenceSession } from "@/lib/map-presence-api-helpers";
import { appendBroadcast, listBroadcastsNear } from "@/lib/map-broadcast-store";

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
  const { id: viewerId, cookieFresh } = await resolvePresenceSession();
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const coords = clampLatLng(lat, lng);
  if (!coords) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const messages = await listBroadcastsNear(coords.lat, coords.lng, viewerId);

  const res = NextResponse.json({ messages });
  if (cookieFresh) applyPresenceCookie(res, viewerId);
  return res;
}

type PostBody = { lat?: unknown; lng?: unknown; text?: unknown };

export async function POST(req: Request) {
  const { id: authorId, cookieFresh } = await resolvePresenceSession();

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

  const rawText = typeof body.text === "string" ? body.text : "";
  const text = sanitizeBody(rawText);
  if (text.length < 1) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }

  const out = await appendBroadcast(authorId, coords.lat, coords.lng, text);
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: 429 });
  }

  const res = NextResponse.json({ ok: true as const, id: out.id });
  if (cookieFresh) applyPresenceCookie(res, authorId);
  return res;
}
