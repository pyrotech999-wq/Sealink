import { NextResponse } from "next/server";
import { normaliseEmail, requireAuthUser } from "@/lib/auth";
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

function asObject(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v === null) return null;
  return v as Record<string, unknown>;
}

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
  const obj = asObject(body);
  const share = obj?.share === true;

  if (!share) {
    await upsertIfmPresence(user.uid, {
      lat: 0,
      lng: 0,
      fullName: "",
      boatName: "",
      avatarDataUrl: "",
      phoneNorm: "",
      ifmContactEmail: "",
      share: false,
    });
    return NextResponse.json({ ok: true, removed: true });
  }

  const lat = typeof obj?.lat === "number" || typeof obj?.lat === "string" ? Number(obj.lat) : NaN;
  const lng = typeof obj?.lng === "number" || typeof obj?.lng === "string" ? Number(obj.lng) : NaN;
  const coords = clampLatLng(lat, lng);
  if (!coords) return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });

  // Use client-provided display fields if present; fall back to browser profile storage (best-effort).
  const fullNameRaw = typeof obj?.fullName === "string" ? obj.fullName : getFullName();
  const boatRaw = typeof obj?.boatName === "string" ? obj.boatName : getBoatName();
  const avatarRaw = typeof obj?.avatarDataUrl === "string" ? obj.avatarDataUrl : getAvatarDataUrl();
  const phoneRaw = typeof obj?.phone === "string" ? obj.phone : getProfilePhone();

  const fullName = String(fullNameRaw || "").replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "SeaLink user";
  const boatName = String(boatRaw || "").replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "";
  const avatarDataUrl = String(avatarRaw || "").trim().slice(0, 450_000);
  const phoneNorm = normalisePhone(String(phoneRaw || ""));
  const shareContactOnIfm = obj?.shareContactOnIfm === true;
  const ifmContactEmail = shareContactOnIfm ? normaliseEmail(user.email).slice(0, 320) : "";

  await upsertIfmPresence(user.uid, {
    lat: coords.lat,
    lng: coords.lng,
    fullName,
    boatName,
    avatarDataUrl,
    phoneNorm,
    ifmContactEmail,
    share: true,
  });

  return NextResponse.json({ ok: true });
}

