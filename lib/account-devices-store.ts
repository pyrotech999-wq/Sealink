import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export type AccountDeviceRow = {
  deviceId: string;
  name: string;
  activatedAt: string;
  lastSeenAt: string;
  active: boolean;
};

type StoreShape = Record<string, AccountDeviceRow[]>;

const DATA_PATH = path.join(process.cwd(), "data", "account-devices.json");
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

export async function listAccountDevices(uid: string): Promise<AccountDeviceRow[]> {
  return enqueue(async () => {
    const store = readStore();
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
    const store = readStore();
    const list = Array.isArray(store[uid]) ? store[uid]! : [];

    const safeId = deviceId.trim().slice(0, 100);
    if (!safeId) return { ok: true, devices: list };

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
    store[uid] = list;
    writeStore(store);

    if (activeCount > maxActive) {
      // Roll back activation of this device (keep row but mark inactive).
      const cur = list.find((d) => d.deviceId === safeId);
      if (cur) cur.active = false;
      writeStore(store);
      return { ok: false, error: "DEVICE_LIMIT", devices: list.filter((d) => d.active) };
    }

    return { ok: true, devices: list.filter((d) => d.active) };
  });
}

export async function deactivateAccountDevice(uid: string, deviceId: string): Promise<AccountDeviceRow[]> {
  return enqueue(async () => {
    const store = readStore();
    const list = Array.isArray(store[uid]) ? store[uid]! : [];
    const idx = list.findIndex((d) => d.deviceId === deviceId);
    if (idx >= 0) list[idx]!.active = false;
    store[uid] = list;
    writeStore(store);
    return list.filter((d) => d.active);
  });
}

