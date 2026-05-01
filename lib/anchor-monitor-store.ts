import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DATA_PATH = path.join(process.cwd(), "data", "anchor-monitor.json");

export type AnchorMonitorConfig = {
  uid: string;
  monitorDeviceId: string | null; // device id which monitors movement
  alertDeviceIds: string[]; // devices which should show alerts (max 2, but not enforced here)
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

function readRaw(): AnchorMonitorConfig[] {
  try {
    if (!existsSync(DATA_PATH)) return [];
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as AnchorMonitorConfig[];
  } catch {
    return [];
  }
}

function writeRaw(list: AnchorMonitorConfig[]): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(list, null, 2), "utf-8");
}

async function readMonitorSupabase(uid: string): Promise<AnchorMonitorConfig> {
  const now = new Date().toISOString();
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("anchor_monitor_config").select("*").eq("user_uid", uid).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return { uid, monitorDeviceId: null, alertDeviceIds: [], updatedAt: now };
  }
  const r = data as Record<string, unknown>;
  const ids = r.alert_device_ids;
  return {
    uid,
    monitorDeviceId: (r.monitor_device_id as string | null) ?? null,
    alertDeviceIds: Array.isArray(ids) ? (ids as string[]).filter((x) => typeof x === "string") : [],
    updatedAt: String(r.updated_at ?? now),
  };
}

export async function getAnchorMonitorConfig(uid: string): Promise<AnchorMonitorConfig> {
  return enqueue(async () => {
    const now = new Date().toISOString();
    if (isSupabaseConfigured()) {
      return readMonitorSupabase(uid);
    }

    const list = readRaw();
    const row = list.find((r) => r.uid === uid) ?? null;
    if (row) return row;
    const created: AnchorMonitorConfig = {
      uid,
      monitorDeviceId: null,
      alertDeviceIds: [],
      updatedAt: now,
    };
    list.push(created);
    writeRaw(list);
    return created;
  });
}

export async function setAnchorMonitorConfig(
  uid: string,
  patch: Partial<Pick<AnchorMonitorConfig, "monitorDeviceId" | "alertDeviceIds">>,
): Promise<AnchorMonitorConfig> {
  return enqueue(async () => {
    const now = new Date().toISOString();
    if (isSupabaseConfigured()) {
      const cur = await readMonitorSupabase(uid);
      const next: AnchorMonitorConfig = {
        ...cur,
        monitorDeviceId:
          patch.monitorDeviceId === undefined ? cur.monitorDeviceId : patch.monitorDeviceId,
        alertDeviceIds:
          patch.alertDeviceIds === undefined
            ? cur.alertDeviceIds
            : Array.isArray(patch.alertDeviceIds)
              ? patch.alertDeviceIds.filter((x) => typeof x === "string" && x.trim()).slice(0, 4)
              : cur.alertDeviceIds,
        updatedAt: now,
      };
      const sb = supabaseAdmin();
      const { error } = await sb.from("anchor_monitor_config").upsert(
        {
          user_uid: uid,
          monitor_device_id: next.monitorDeviceId,
          alert_device_ids: next.alertDeviceIds,
          updated_at: next.updatedAt,
        },
        { onConflict: "user_uid" },
      );
      if (error) throw new Error(error.message);
      return next;
    }

    const list = readRaw();
    const idx = list.findIndex((r) => r.uid === uid);
    const cur: AnchorMonitorConfig =
      idx >= 0
        ? list[idx]!
        : { uid, monitorDeviceId: null, alertDeviceIds: [], updatedAt: now };
    const next: AnchorMonitorConfig = {
      ...cur,
      monitorDeviceId:
        patch.monitorDeviceId === undefined ? cur.monitorDeviceId : patch.monitorDeviceId,
      alertDeviceIds:
        patch.alertDeviceIds === undefined
          ? cur.alertDeviceIds
          : Array.isArray(patch.alertDeviceIds)
            ? patch.alertDeviceIds.filter((x) => typeof x === "string" && x.trim()).slice(0, 4)
            : cur.alertDeviceIds,
      updatedAt: now,
    };
    if (idx >= 0) list[idx] = next;
    else list.push(next);
    writeRaw(list);
    return next;
  });
}

