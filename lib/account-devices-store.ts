import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { canUseKv, kvGetJson, kvSetJson } from "@/lib/kv-json";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type AccountDeviceRow = {
  deviceId: string;
  name: string;
  activatedAt: string;
  lastSeenAt: string;
  active: boolean;
};

type StoreShape = Record<string, AccountDeviceRow[]>;

const DATA_PATH = path.join(process.cwd(), "data", "account-devices.json");
const KV_KEY = "sealink:account-devices:v1";
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function readStore(): StoreShape {
  try {
    if (!existsSync(DATA_PATH)) return {};
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoreShape;
  } catch {
    return {};
  }
}

function writeStore(store: StoreShape): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), "utf-8");
}

function normaliseName(name: string): string {
  return name.replace(/[\r\n]+/g, " ").trim().slice(0, 40);
}

function mapDbRow(r: Record<string, unknown>): AccountDeviceRow {
  return {
    deviceId: String(r.device_id ?? ""),
    name: String(r.name ?? ""),
    activatedAt: String(r.activated_at ?? ""),
    lastSeenAt: String(r.last_seen_at ?? ""),
    active: Boolean(r.active),
  };
}

async function listSupabase(uid: string): Promise<AccountDeviceRow[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("account_devices").select("*").eq("user_uid", uid);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapDbRow(r as Record<string, unknown>)).sort((a, b) => (a.activatedAt < b.activatedAt ? -1 : 1));
}

async function syncSupabaseDevices(uid: string, list: AccountDeviceRow[]): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from("account_devices").delete().eq("user_uid", uid);
  if (!list.length) return;
  const rows = list.map((d) => ({
    user_uid: uid,
    device_id: d.deviceId,
    name: d.name,
    activated_at: d.activatedAt,
    last_seen_at: d.lastSeenAt,
    active: d.active,
  }));
  const { error } = await sb.from("account_devices").insert(rows);
  if (error) throw new Error(error.message);
}

export async function listAccountDevices(uid: string): Promise<AccountDeviceRow[]> {
  return enqueue(async () => {
    if (isSupabaseConfigured()) {
      return listSupabase(uid);
    }
    const store = canUseKv() ? await kvGetJson<StoreShape>(KV_KEY, {}) : readStore();
    const list = Array.isArray(store[uid]) ? store[uid]! : [];
    return list.slice().sort((a, b) => (a.activatedAt < b.activatedAt ? -1 : 1));
  });
}

export type RegisterResult =
  | { ok: true; devices: AccountDeviceRow[] }
  | { ok: false; error: "DEVICE_LIMIT"; devices: AccountDeviceRow[] };

export async function registerAccountDevice(
  uid: string,
  deviceId: string,
  name: string,
  maxActive = 2,
): Promise<RegisterResult> {
  return enqueue(async () => {
    const now = new Date().toISOString();
    let list: AccountDeviceRow[];

    if (isSupabaseConfigured()) {
      list = await listSupabase(uid);
    } else {
      const store = canUseKv() ? await kvGetJson<StoreShape>(KV_KEY, {}) : readStore();
      list = Array.isArray(store[uid]) ? store[uid]!.map((d) => ({ ...d })) : [];
    }

    const safeId = deviceId.trim().slice(0, 100);
    if (!safeId) {
      return { ok: true, devices: list.filter((d) => d.active) };
    }

    const safeName = normaliseName(name);
    const idx = list.findIndex((d) => d.deviceId === safeId);
    if (idx >= 0) {
      const row = list[idx]!;
      row.name = safeName || row.name;
      row.lastSeenAt = now;
      row.active = true;
    } else {
      list.push({ deviceId: safeId, name: safeName, activatedAt: now, lastSeenAt: now, active: true });
    }

    const activeCount = list.filter((d) => d.active).length;

    if (activeCount > maxActive) {
      const cur = list.find((d) => d.deviceId === safeId);
      if (cur) cur.active = false;
      if (isSupabaseConfigured()) {
        await syncSupabaseDevices(uid, list);
      } else {
        const store = canUseKv() ? await kvGetJson<StoreShape>(KV_KEY, {}) : readStore();
        store[uid] = list;
        if (canUseKv()) await kvSetJson(KV_KEY, store);
        else writeStore(store);
      }
      return { ok: false, error: "DEVICE_LIMIT", devices: list.filter((d) => d.active) };
    }

    if (isSupabaseConfigured()) {
      await syncSupabaseDevices(uid, list);
    } else {
      const store = canUseKv() ? await kvGetJson<StoreShape>(KV_KEY, {}) : readStore();
      store[uid] = list;
      if (canUseKv()) await kvSetJson(KV_KEY, store);
      else writeStore(store);
    }

    return { ok: true, devices: list.filter((d) => d.active) };
  });
}

export async function deactivateAccountDevice(uid: string, deviceId: string): Promise<AccountDeviceRow[]> {
  return enqueue(async () => {
    let list: AccountDeviceRow[];
    if (isSupabaseConfigured()) {
      list = await listSupabase(uid);
    } else {
      const store = canUseKv() ? await kvGetJson<StoreShape>(KV_KEY, {}) : readStore();
      list = Array.isArray(store[uid]) ? store[uid]!.map((d) => ({ ...d })) : [];
    }
    const idx = list.findIndex((d) => d.deviceId === deviceId);
    if (idx >= 0) list[idx]!.active = false;

    if (isSupabaseConfigured()) {
      await syncSupabaseDevices(uid, list);
    } else {
      const store = canUseKv() ? await kvGetJson<StoreShape>(KV_KEY, {}) : readStore();
      store[uid] = list;
      if (canUseKv()) await kvSetJson(KV_KEY, store);
      else writeStore(store);
    }
    return list.filter((d) => d.active);
  });
}
