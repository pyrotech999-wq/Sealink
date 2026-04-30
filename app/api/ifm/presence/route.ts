import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { getAvatarDataUrl, getBoatName, getFullName, getProfilePhone } from "@/lib/map-profile-storage";
import { normalisePhone } from "@/lib/phone-normalise";
import {
  listAllIfmPeers,
  listIfmPeersByContacts,
  listIfmPeersLocal,
  upsertIfmPresence,
} from "@/lib/ifm-presence-store";
import { friendTargets, listIfmFriends } from "@/lib/ifm-friends-store";

export const runtime = "nodejs";

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export async function GET(req: Request): Promise<Response> {
  const user = await requireAuthUser();
  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") || "all") as "all" | "friends" | "local";

  if (mode === "local") {
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const coords = clampLatLng(lat, lng);
    if (!coords) return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    const peers = await listIfmPeersLocal(coords.lat, coords.lng, 10, user.uid);
    return NextResponse.json({ peers });
  }

  if (mode === "friends") {
    const friends = await listIfmFriends(user.uid);
    const { uids, phones } = friendTargets(friends);
    const peers = await listIfmPeersByContacts(user.uid, uids, phones);
    return NextResponse.json({ peers, friends });
  }

  const peers = await listAllIfmPeers(user.uid);
  return NextResponse.json({ peers });
}

export async function POST(req: Request): Promise<Response> {
  const user = await requireAuthUser();
  let body: unknown = null;
  try {
    body = (await req.json()) as unknown;
  } catch {
    body = null;
  }
  const share = Boolean(body && typeof body === "object" && "share" in body ? (body as any).share === true : false);

  if (!share) {
    await upsertIfmPresence(user.uid, {
      lat: 0,
      lng: 0,
      fullName: "",
      boatName: "",
      avatarDataUrl: "",
      phoneNorm: "",
      share: false,
    });
    return NextResponse.json({ ok: true, removed: true });
  }

  const lat = body && typeof body === "object" ? Number((body as any).lat) : NaN;
  const lng = body && typeof body === "object" ? Number((body as any).lng) : NaN;
  const coords = clampLatLng(lat, lng);
  if (!coords) return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });

  // Use client-provided display fields if present; fall back to browser profile storage (best-effort).
  const fullNameRaw = body && typeof body === "object" && typeof (body as any).fullName === "string" ? (body as any).fullName : getFullName();
  const boatRaw = body && typeof body === "object" && typeof (body as any).boatName === "string" ? (body as any).boatName : getBoatName();
  const avatarRaw = body && typeof body === "object" && typeof (body as any).avatarDataUrl === "string" ? (body as any).avatarDataUrl : getAvatarDataUrl();
  const phoneRaw = body && typeof body === "object" && typeof (body as any).phone === "string" ? (body as any).phone : getProfilePhone();

  const fullName = String(fullNameRaw || "").replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "SeaLink user";
  const boatName = String(boatRaw || "").replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "";
  const avatarDataUrl = String(avatarRaw || "").trim().slice(0, 450_000);
  const phoneNorm = normalisePhone(String(phoneRaw || ""));

  await upsertIfmPresence(user.uid, {
    lat: coords.lat,
    lng: coords.lng,
    fullName,
    boatName,
    avatarDataUrl,
    phoneNorm,
    share: true,
  });

  return NextResponse.json({ ok: true });
}

