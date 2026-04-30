import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

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

export async function getAnchorMonitorConfig(uid: string): Promise<AnchorMonitorConfig> {
  return enqueue(async () => {
    const now = new Date().toISOString();
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
    const list = readRaw();
    const now = new Date().toISOString();
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

