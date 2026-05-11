import { listAccountDevices } from "@/lib/account-devices-store";
import { normaliseAnchorDeviceRowsForUi } from "@/lib/anchor-device-display";
import { listAnchorDevices, type AnchorDeviceRow } from "@/lib/anchor-devices-store";

/**
 * Devices for anchor UI: active account_devices (max 2) are the source of truth; anchor store adds last GPS.
 * Anchor-only rows are included if present (e.g. legacy data).
 */
export async function listAnchorDevicesForUi(uid: string): Promise<AnchorDeviceRow[]> {
  const [fromAnchor, accountDevs] = await Promise.all([listAnchorDevices(uid), listAccountDevices(uid)]);
  const anchorById = new Map(fromAnchor.map((r) => [r.deviceId, r]));
  const map = new Map<string, AnchorDeviceRow>();

  for (const a of accountDevs) {
    if (!a.active) continue;
    const gps = anchorById.get(a.deviceId);
    const name = (gps?.name?.trim() || a.name?.trim() || "This device").slice(0, 40) || "This device";
    map.set(a.deviceId, {
      uid,
      deviceId: a.deviceId,
      name,
      updatedAt: gps?.updatedAt ?? a.lastSeenAt,
      lastLat: gps?.lastLat ?? null,
      lastLng: gps?.lastLng ?? null,
      lastFixAt: gps?.lastFixAt ?? null,
    });
  }


  return normaliseAnchorDeviceRowsForUi([...map.values()]);
}

/** Map device id → display label for anchor warnings (monitor switch, etc.). */
export async function anchorDeviceDisplayNameMap(uid: string): Promise<Map<string, string>> {
  const rows = await listAnchorDevicesForUi(uid);
  return new Map(rows.map((r) => [r.deviceId, r.name.trim() || r.deviceId.slice(0, 8)]));
}

export function formatMonitorSwitchEndpointLabel(
  map: Map<string, string>,
  deviceId: string | null,
): string {
  if (deviceId == null || deviceId === "") return "not set";
  const n = map.get(deviceId)?.trim();
  if (n) return n;
  return "Unnamed device";
}
