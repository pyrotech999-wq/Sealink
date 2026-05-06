import { NextResponse } from "next/server";

import { canUseKv, kvGetJson } from "@/lib/kv-json";
import { OPENCPN_PILOT_ARCHIVES, OPENCPN_PILOT_MD5_URL } from "@/lib/navigation-charts/opencpn-pilot-charts-catalog";
import {
  mergeCatalogWithManifest,
  PILOT_CHARTS_KV_KEY,
  type PilotArchivesManifest,
} from "@/lib/navigation-charts/pilot-charts-manifest";

export const dynamic = "force-dynamic";

export async function GET() {
  let manifest: PilotArchivesManifest | null = null;
  if (canUseKv()) {
    manifest = await kvGetJson<PilotArchivesManifest | null>(PILOT_CHARTS_KV_KEY, null);
  }

  const archives = mergeCatalogWithManifest(OPENCPN_PILOT_ARCHIVES, manifest);
  const md5Row = manifest?.rows.find((r) => r.id === "md5") ?? null;

  return NextResponse.json({
    sourcePage: "https://opencpn.org/OpenCPN/info/pilotcharts.html",
    manifestCheckedAt: manifest?.checkedAt ?? null,
    archives,
    md5: {
      label: "MD5 sums",
      downloadUrl: OPENCPN_PILOT_MD5_URL,
      head: md5Row,
    },
  });
}
