import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { appendBroadcastReplyMessage, listBroadcastReplyMessages } from "@/lib/broadcast-reply-store";

export const runtime = "nodejs";

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export async function GET(req: Request) {
  let viewerUid: string;
  try {
    viewerUid = (await requireAuthUser()).uid;
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const broadcastId = (url.searchParams.get("broadcastId") ?? "").trim();
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const coords = clampLatLng(lat, lng);
  if (!broadcastId || !coords) {
    return NextResponse.json({ error: "broadcastId, lat, and lng required" }, { status: 400 });
  }

  try {
    const out = await listBroadcastReplyMessages(viewerUid, broadcastId, coords.lat, coords.lng);
    if (!out.ok) {
      const status = out.error.includes("not found") ? 404 : out.error.includes("cannot access") ? 403 : 400;
      return NextResponse.json({ error: out.error }, { status });
    }
    return NextResponse.json({ threadId: out.threadId, messages: out.messages });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load replies";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PostBody = { broadcastId?: unknown; text?: unknown; lat?: unknown; lng?: unknown };

export async function POST(req: Request) {
  let viewerUid: string;
  try {
    viewerUid = (await requireAuthUser()).uid;
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const broadcastId = typeof body.broadcastId === "string" ? body.broadcastId.trim() : "";
  const text = typeof body.text === "string" ? body.text : "";
  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  const coords = clampLatLng(lat, lng);
  if (!broadcastId || !coords) {
    return NextResponse.json({ error: "broadcastId, lat, and lng required" }, { status: 400 });
  }

  try {
    const out = await appendBroadcastReplyMessage(viewerUid, broadcastId, coords.lat, coords.lng, text);
    if (!out.ok) {
      const status =
        out.error.includes("not found") || out.error.includes("no longer") ? 404 : out.error.includes("cannot") ? 403 : 400;
      return NextResponse.json({ error: out.error }, { status });
    }
    return NextResponse.json({ ok: true as const });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not send reply";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
