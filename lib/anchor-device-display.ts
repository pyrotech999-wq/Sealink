import type { AnchorDeviceRow } from "@/lib/anchor-devices-store";

/** Non-empty label for anchor / device pickers (never rely on raw device IDs in UI). */
export function normaliseAnchorDeviceLabel(name: string | undefined | null): string {
  const t = typeof name === "string" ? name.replace(/\r\n/g, " ").trim() : "";
  return t || "This device";
}

/**
 * Ensures each row has a display name; when several devices share the same label after
 * normalisation, appends stable numeric suffixes so two-phone setups stay distinguishable.
 */
export function normaliseAnchorDeviceRowsForUi(rows: AnchorDeviceRow[]): AnchorDeviceRow[] {
  const withNames = rows.map((r) => ({
    ...r,
    name: normaliseAnchorDeviceLabel(r.name).slice(0, 40),
  }));

  const keyFor = (name: string) => name.toLowerCase();
  const groups = new Map<string, AnchorDeviceRow[]>();
  for (const r of withNames) {
    const k = keyFor(r.name);
    const g = groups.get(k) ?? [];
    g.push(r);
    groups.set(k, g);
  }
  for (const g of groups.values()) {
    if (g.length <= 1) continue;
    g.sort((a, b) => a.deviceId.localeCompare(b.deviceId));
    const base = g[0]!.name;
    for (let i = 0; i < g.length; i++) {
      g[i]!.name = `${base} (${i + 1})`.slice(0, 40);
    }
  }

  return withNames.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
