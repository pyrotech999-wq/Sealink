import type { OpenCpnPilotArchive } from "@/lib/navigation-charts/opencpn-pilot-charts-catalog";

export const PILOT_CHARTS_KV_KEY = "navigation-charts:pilot-archives-head:v1";

export type PilotArchiveHeadRow = {
  id: string;
  checkedAt: string;
  httpStatus: number;
  ok: boolean;
  lastModified: string | null;
  contentLength: string | null;
};

export type PilotArchivesManifest = {
  /** ISO timestamp when the cron job finished */
  checkedAt: string;
  rows: PilotArchiveHeadRow[];
};

export type PilotDownloadApiItem = OpenCpnPilotArchive & {
  head: PilotArchiveHeadRow | null;
};

export function mergeCatalogWithManifest(
  catalog: readonly OpenCpnPilotArchive[],
  manifest: PilotArchivesManifest | null,
): PilotDownloadApiItem[] {
  const byId = new Map((manifest?.rows ?? []).map((r) => [r.id, r]));
  return catalog.map((c) => ({ ...c, head: byId.get(c.id) ?? null }));
}
