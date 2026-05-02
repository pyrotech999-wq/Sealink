import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { distanceMiles } from "@/lib/geo-haversine";
import { canUseKv, kvGetJson, kvSetJson } from "@/lib/kv-json";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DATA_PATH = path.join(process.cwd(), "data", "ifm-presence.json");
const KV_KEY = "sealink:ifm-presence:v1";

export type IfmPresenceRecord = {
  uid: string;
  lat: number;
  lng: number;
  fullName: string;
  boatName: string;
  avatarDataUrl: string;
  phoneNorm: string;
  /** Normalised sign-in email; only non-empty when user opted in to share on IFM. */
  ifmContactEmail: string;
  updatedAt: string;
  share: boolean;
};

export type IfmPeer = {
  uid: string;
  lat: number;
  lng: number;
  fullName: string;
  boatName: string;
  avatarDataUrl: string;
  phoneNorm: string;
  /** Present when the user chose to share their email on IFM for friend adds. */
  contactEmail: string;
  updatedAt: string;
};

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function ensureIfmRecord(r: IfmPresenceRecord): IfmPresenceRecord {
  return {
    ...r,
    ifmContactEmail: typeof r.ifmContactEmail === "string" ? r.ifmContactEmail : "",
  };
}

function readRawFile(): IfmPresenceRecord[] {
  try {
    if (!existsSync(DATA_PATH)) return [];
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as IfmPresenceRecord[]).map((row) => ensureIfmRecord(row));
  } catch {
    return [];
  }
}

function writeRawFile(list: IfmPresenceRecord[]): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(list, null, 2), "utf-8");
}

function staleMs(): number {
  return 20 * 60 * 1000;
}

function prune(list: IfmPresenceRecord[], now: Date): IfmPresenceRecord[] {
  const cutoff = now.getTime() - staleMs();
  return list.filter((r) => new Date(r.updatedAt).getTime() >= cutoff);
}

function toPeer(r: IfmPresenceRecord): IfmPeer {
  return {
    uid: r.uid,
    lat: r.lat,
    lng: r.lng,
    fullName: r.fullName,
    boatName: r.boatName,
    avatarDataUrl: r.avatarDataUrl || "",
    phoneNorm: r.phoneNorm || "",
    contactEmail: (r.ifmContactEmail || "").trim().toLowerCase(),
    updatedAt: r.updatedAt,
  };
}

function rowDbToRecord(r: Record<string, unknown>): IfmPresenceRecord | null {
  if (typeof r.uid !== "string") return null;
  const emailRaw = typeof r.ifm_contact_email === "string" ? r.ifm_contact_email : "";
  return {
    uid: r.uid,
    lat: typeof r.lat === "number" ? r.lat : Number(r.lat),
    lng: typeof r.lng === "number" ? r.lng : Number(r.lng),
    fullName: typeof r.full_name === "string" ? r.full_name : "",
    boatName: typeof r.boat_name === "string" ? r.boat_name : "",
    avatarDataUrl: typeof r.avatar_data_url === "string" ? r.avatar_data_url : "",
    phoneNorm: typeof r.phone_norm === "string" ? r.phone_norm : "",
    ifmContactEmail: emailRaw.trim().toLowerCase().slice(0, 320),
    updatedAt: typeof r.updated_at === "string" ? r.updated_at : new Date().toISOString(),
    share: r.share === true,
  };
}

async function readRawUnified(now: Date): Promise<IfmPresenceRecord[]> {
  const cutoffIso = new Date(now.getTime() - staleMs()).toISOString();

  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("ifm_presence")
      .select("*")
      .eq("share", true)
      .gte("updated_at", cutoffIso);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row) => rowDbToRecord(row as Record<string, unknown>))
      .filter(Boolean) as IfmPresenceRecord[];
  }

  if (canUseKv()) {
    const raw = ((await kvGetJson<IfmPresenceRecord[]>(KV_KEY, [])) ?? []).map(ensureIfmRecord);
    return prune(raw, now);
  }

  const raw = readRawFile();
  return prune(raw, now);
}

/** File/KV: merge one user into full list. Supabase: single-row upsert or delete. */
async function upsertUnified(
  uid: string,
  patch: {
    lat: number;
    lng: number;
    fullName: string;
    boatName: string;
    avatarDataUrl: string;
    phoneNorm: string;
    ifmContactEmail: string;
    share: boolean;
  },
): Promise<void> {
  const now = new Date();

  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    if (!patch.share) {
      const { error } = await sb.from("ifm_presence").delete().eq("uid", uid);
      if (error) throw new Error(error.message);
      return;
    }
    const row = {
      uid,
      lat: patch.lat,
      lng: patch.lng,
      full_name: patch.fullName,
      boat_name: patch.boatName,
      avatar_data_url: patch.avatarDataUrl,
      phone_norm: patch.phoneNorm,
      ifm_contact_email: patch.ifmContactEmail,
      updated_at: now.toISOString(),
      share: true,
    };
    const { error } = await sb.from("ifm_presence").upsert(row, { onConflict: "uid" });
    if (error) throw new Error(error.message);
    return;
  }

  let list = await readRawUnified(now);
  if (!patch.share) {
    list = list.filter((r) => r.uid !== uid);
    if (canUseKv()) await kvSetJson(KV_KEY, list);
    else writeRawFile(list);
    return;
  }

  const next: IfmPresenceRecord = {
    uid,
    lat: patch.lat,
    lng: patch.lng,
    fullName: patch.fullName,
    boatName: patch.boatName,
    avatarDataUrl: patch.avatarDataUrl,
    phoneNorm: patch.phoneNorm,
    ifmContactEmail: patch.ifmContactEmail,
    updatedAt: now.toISOString(),
    share: true,
  };
  const idx = list.findIndex((r) => r.uid === uid);
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  if (canUseKv()) await kvSetJson(KV_KEY, list);
  else writeRawFile(list);
}

async function persistPrunedFileIfNeeded(raw: IfmPresenceRecord[], pruned: IfmPresenceRecord[]): Promise<void> {
  if (isSupabaseConfigured()) return;
  if (raw.length !== pruned.length) {
    if (canUseKv()) await kvSetJson(KV_KEY, pruned);
    else writeRawFile(pruned);
  }
}

export async function upsertIfmPresence(
  uid: string,
  patch: {
    lat: number;
    lng: number;
    fullName: string;
    boatName: string;
    avatarDataUrl: string;
    phoneNorm: string;
    ifmContactEmail: string;
    share: boolean;
  },
): Promise<void> {
  return enqueue(async () => {
    await upsertUnified(uid, patch);
  });
}

export async function listAllIfmPeers(excludeUid: string, now = new Date()): Promise<IfmPeer[]> {
  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      const list = await readRawUnified(now);
      return list
        .filter((r) => r.share && r.uid !== excludeUid)
        .map(toPeer)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    const raw = (
      canUseKv() ? ((await kvGetJson<IfmPresenceRecord[]>(KV_KEY, [])) ?? []) : readRawFile()
    ).map(ensureIfmRecord);
    const list = prune(raw, now);
    await persistPrunedFileIfNeeded(raw, list);
    return list
      .filter((r) => r.share && r.uid !== excludeUid)
      .map(toPeer)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });
}

export async function listIfmPeersLocal(
  lat: number,
  lng: number,
  radiusMi: number,
  excludeUid: string,
  now = new Date(),
): Promise<IfmPeer[]> {
  return enqueue(async () => {
    const list =
      isSupabaseConfigured() || canUseKv()
        ? await readRawUnified(now)
        : (() => {
            const raw = readRawFile();
            const p = prune(raw, now);
            if (p.length !== raw.length) writeRawFile(p);
            return p;
          })();

    const out: IfmPeer[] = [];
    for (const r of list) {
      if (!r.share) continue;
      if (r.uid === excludeUid) continue;
      const mi = distanceMiles(lat, lng, r.lat, r.lng);
      if (mi <= radiusMi) out.push(toPeer(r));
    }
    return out;
  });
}

export async function listIfmPeersByContacts(
  excludeUid: string,
  wantUids: string[],
  wantPhones: string[],
  now = new Date(),
): Promise<IfmPeer[]> {
  return enqueue(async () => {
    const uidSet = new Set(wantUids.filter(Boolean));
    const phoneSet = new Set(wantPhones.filter(Boolean));

    const list =
      isSupabaseConfigured() || canUseKv()
        ? await readRawUnified(now)
        : (() => {
            const raw = readRawFile();
            const p = prune(raw, now);
            if (p.length !== raw.length) writeRawFile(p);
            return p;
          })();

    return list
      .filter((r) => r.share && r.uid !== excludeUid && (uidSet.has(r.uid) || (r.phoneNorm && phoneSet.has(r.phoneNorm))))
      .map(toPeer)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });
}

/** Last stored IFM `phone_norm` for a user (matches IFM friends added by phone). Empty if none. */
export async function getIfmPhoneNormForUid(uid: string): Promise<string> {
  if (!uid) return "";
  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("ifm_presence").select("phone_norm").eq("uid", uid).maybeSingle();
    if (error || !data) return "";
    const p =
      typeof (data as { phone_norm?: string }).phone_norm === "string"
        ? (data as { phone_norm: string }).phone_norm
        : "";
    return p.trim();
  }
  const raw = canUseKv() ? ((await kvGetJson<IfmPresenceRecord[]>(KV_KEY, [])) ?? []) : readRawFile();
  const row = raw.find((r) => r.uid === uid);
  return (row?.phoneNorm ?? "").trim();
}
