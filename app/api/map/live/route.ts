import { NextResponse } from "next/server";
import { applyPresenceCookie, resolvePresenceSession } from "@/lib/map-presence-api-helpers";
import {
  appendBroadcast,
  deleteBroadcast,
  listBroadcastsNear,
  parseMapBroadcastAudience,
} from "@/lib/map-broadcast-store";
import { canSendGlobalAreaBroadcast, getAuthUser, requireAuthUser } from "@/lib/auth";
import { listUnreadBroadcastReplyAlerts } from "@/lib/broadcast-reply-store";

export const runtime = "nodejs";

type LivePayload = { ok: true; messages: unknown[]; replyAlerts: unknown[] };

type CacheEntry = {
  expiresAtMs: number;
  payload: LivePayload;
};

type DedupeEntry = {
  promise: Promise<LivePayload>;
};

const G_CACHE = "__sealink_map_live_cache_v1";

function caches(): {
  cache: Map<string, CacheEntry>;
  inflight: Map<string, DedupeEntry>;
} {
  const g = globalThis as unknown as Record<string, { cache: Map<string, CacheEntry>; inflight: Map<string, DedupeEntry> } | undefined>;
  if (!g[G_CACHE]) {
    g[G_CACHE] = { cache: new Map(), inflight: new Map() };
  }
  return g[G_CACHE]!;
}

function ttlMs(): number {
  // 20–30 seconds jitter to spread load across instances.
  return 20_000 + Math.floor(Math.random() * 10_001);
}

function bucketCoord(n: number): number {
  // Bucket to ~0.001° (~111m lat). Small enough to be stable across repeated loads while
  // still providing meaningful cache reuse under slight GPS jitter.
  return Math.round(n * 1000) / 1000;
}

function stableCacheKey(url: URL, coords: { lat: number; lng: number }): string {
  // Cache key must be stable for identical inputs:
  // - Include only rounded lat/lng and real query params (sorted), excluding lat/lng duplicates.
  // - Do NOT include cookies, headers, request ids, timestamps, etc.
  const parts: string[] = [];
  parts.push(`lat=${bucketCoord(coords.lat)}`);
  parts.push(`lng=${bucketCoord(coords.lng)}`);
  const extras: string[] = [];
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "lat" || k === "lng") continue;
    extras.push(`${k}=${v}`);
  }
  extras.sort();
  if (extras.length) parts.push(...extras);
  return parts.join("|");
}

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export async function GET(req: Request) {
  try {
    const { id: viewerId, cookieFresh } = await resolvePresenceSession();
    const viewer = await getAuthUser().catch(() => null);
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const coords = clampLatLng(lat, lng);
    if (!coords) {
      return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    }

    const { cache, inflight } = caches();
    const key = stableCacheKey(url, coords);
    const now = Date.now();

    const hit = cache.get(key);
    if (hit && hit.expiresAtMs > now) {
      console.info("MAP_LIVE_CACHE_HIT", { key });
      const res = NextResponse.json(hit.payload);
      if (cookieFresh) applyPresenceCookie(res, viewerId);
      return res;
    }

    const inF = inflight.get(key);
    if (inF) {
      console.info("MAP_LIVE_DEDUPE", { key });
      const payload = await inF.promise;
      const res = NextResponse.json(payload);
      if (cookieFresh) applyPresenceCookie(res, viewerId);
      return res;
    }

    console.info("MAP_LIVE_CACHE_MISS", { key });
    const promise = (async (): Promise<LivePayload> => {
      const messages = await listBroadcastsNear(coords.lat, coords.lng, viewer?.uid ?? null, viewer?.isAdmin ?? false);
      const replyAlerts = viewer
        ? await listUnreadBroadcastReplyAlerts(viewer.uid, coords.lat, coords.lng, viewer.isAdmin)
        : [];
      return { ok: true as const, messages, replyAlerts };
    })();
    inflight.set(key, { promise });

    let payload: LivePayload;
    try {
      payload = await promise;
    } finally {
      inflight.delete(key);
    }

    cache.set(key, { payload, expiresAtMs: now + ttlMs() });
    const res = NextResponse.json(payload);
    if (cookieFresh) applyPresenceCookie(res, viewerId);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load live data";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function sanitizeBody(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, 500);
}

type PostBody = {
  lat?: unknown;
  lng?: unknown;
  text?: unknown;
  broadcastAllAreas?: unknown;
  audience?: unknown;
};

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

  const audience = broadcastAllAreas ? "all_nearby" : parseMapBroadcastAudience(body.audience);

  const out = await appendBroadcast(authorUid, coords.lat, coords.lng, text, {
    isGlobal: broadcastAllAreas,
    audience,
  });
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

