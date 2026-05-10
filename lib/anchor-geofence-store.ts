import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseAnchorRadiusM, type AnchorAlertConfig } from "@/lib/anchor-alert-storage";

const DATA_PATH = path.join(process.cwd(), "data", "anchor-geofence.json");

export type AnchorGeofenceConfigRow = AnchorAlertConfig & { uid: string; updatedAt: string };

let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function defaults(uid: string): AnchorGeofenceConfigRow {
  return {
    uid,
    armed: false,
    lat: null,
    lng: null,
    radiusM: 20,
    angleDeg: 360,
    monitorDeviceId: "this",
    lastBearingDeg: null,
    lastAlertAt: null,
    remoteAlarmSilencedUntilReset: false,
    updatedAt: new Date().toISOString(),
  };
}

function readRaw(): AnchorGeofenceConfigRow[] {
  try {
    if (!existsSync(DATA_PATH)) return [];
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AnchorGeofenceConfigRow[]) : [];
  } catch {
    return [];
  }
}

function writeRaw(list: AnchorGeofenceConfigRow[]): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(list, null, 2), "utf-8");
}

function fromDb(uid: string, r: Record<string, unknown>): AnchorGeofenceConfigRow {
  return {
    uid,
    armed: r.armed === true,
    lat: typeof r.anchor_lat === "number" && Number.isFinite(r.anchor_lat) ? (r.anchor_lat as number) : null,
    lng: typeof r.anchor_lng === "number" && Number.isFinite(r.anchor_lng) ? (r.anchor_lng as number) : null,
    radiusM: parseAnchorRadiusM(r.radius_m, { fromTrustedStore: true }),
    angleDeg:
      typeof r.angle_deg === "number" && Number.isFinite(r.angle_deg)
        ? Math.max(0, Math.min(360, Math.round(r.angle_deg as number)))
        : 360,
    monitorDeviceId: typeof r.monitor_device_id === "string" && r.monitor_device_id ? (r.monitor_device_id as string) : "this",
    lastBearingDeg:
      typeof r.last_bearing_deg === "number" && Number.isFinite(r.last_bearing_deg)
        ? (r.last_bearing_deg as number)
        : null,
    lastAlertAt: r.last_alert_at != null ? String(r.last_alert_at) : null,
    remoteAlarmSilencedUntilReset: r.remote_alarm_silenced_until_reset === true,
    updatedAt: r.updated_at != null ? String(r.updated_at) : new Date().toISOString(),
  };
}

function toDb(uid: string, c: AnchorAlertConfig, updatedAt: string): Record<string, unknown> {
  return {
    user_uid: uid,
    armed: c.armed,
    anchor_lat: c.lat,
    anchor_lng: c.lng,
    radius_m: c.radiusM,
    angle_deg: Math.max(0, Math.min(360, Math.round(c.angleDeg ?? 360))),
    monitor_device_id: c.monitorDeviceId || "this",
    last_bearing_deg: c.lastBearingDeg,
    last_alert_at: c.lastAlertAt,
    remote_alarm_silenced_until_reset: c.remoteAlarmSilencedUntilReset === true,
    updated_at: updatedAt,
  };
}

/**
 * Read current row without touching the serialisation queue.
 * **Must** be used from inside `setAnchorGeofenceConfig`'s `enqueue` callback — calling `getAnchorGeofenceConfig` there
 * deadlocks (inner read waits on the same queue tail that only advances after the outer task finishes → 504).
 */
async function readAnchorGeofenceConfigRowUnqueued(uid: string): Promise<AnchorGeofenceConfigRow> {
  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("anchor_geofence_config").select("*").eq("user_uid", uid).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return defaults(uid);
    return fromDb(uid, data as Record<string, unknown>);
  }
  const list = readRaw();
  const row = list.find((x) => x.uid === uid);
  return row ?? defaults(uid);
}

export async function getAnchorGeofenceConfig(uid: string): Promise<AnchorGeofenceConfigRow> {
  return enqueue(() => readAnchorGeofenceConfigRowUnqueued(uid));
}

export async function setAnchorGeofenceConfig(
  uid: string,
  patch: Partial<AnchorAlertConfig>,
  opts?: { isAdmin?: boolean },
): Promise<AnchorGeofenceConfigRow> {
  return enqueue(async () => {
    const cur = await readAnchorGeofenceConfigRowUnqueued(uid);
    const updatedAt = new Date().toISOString();
    const next: AnchorGeofenceConfigRow = {
      ...cur,
      ...patch,
      radiusM:
        patch.radiusM != null ? parseAnchorRadiusM(patch.radiusM, { isAdmin: opts?.isAdmin === true }) : cur.radiusM,
      angleDeg:
        patch.angleDeg != null && Number.isFinite(patch.angleDeg)
          ? Math.max(0, Math.min(360, Math.round(patch.angleDeg)))
          : cur.angleDeg,
      monitorDeviceId: typeof patch.monitorDeviceId === "string" ? patch.monitorDeviceId : cur.monitorDeviceId,
      remoteAlarmSilencedUntilReset:
        typeof patch.remoteAlarmSilencedUntilReset === "boolean"
          ? patch.remoteAlarmSilencedUntilReset
          : (cur.remoteAlarmSilencedUntilReset ?? false),
      updatedAt,
    };

    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      const { error } = await sb.from("anchor_geofence_config").upsert(toDb(uid, next, updatedAt), { onConflict: "user_uid" });
      if (error) throw new Error(error.message);
      return next;
    }

    const list = readRaw();
    const idx = list.findIndex((x) => x.uid === uid);
    if (idx >= 0) list[idx] = next;
    else list.push(next);
    writeRaw(list);
    return next;
  });
}

