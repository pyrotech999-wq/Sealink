import {
  OPENCPN_PILOT_ARCHIVES,
  OPENCPN_PILOT_MD5_URL,
} from "@/lib/navigation-charts/opencpn-pilot-charts-catalog";
import type { PilotArchiveHeadRow, PilotArchivesManifest } from "@/lib/navigation-charts/pilot-charts-manifest";

async function probeUrl(url: string): Promise<Omit<PilotArchiveHeadRow, "id" | "checkedAt">> {
  const tryHead = async () =>
    fetch(url, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
      headers: { Accept: "*/*" },
    });

  let res = await tryHead();
  if (res.status === 405 || res.status === 501) {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { Range: "bytes=0-0", Accept: "*/*" },
    });
  }

  const ok = res.ok;
  const lastModified = res.headers.get("last-modified");
  const contentLength = res.headers.get("content-length");
  return {
    httpStatus: res.status,
    ok,
    lastModified,
    contentLength,
  };
}

/** HEAD (or tiny GET) each official archive + md5.txt; does not download full archives. */
export async function buildPilotArchivesManifest(): Promise<PilotArchivesManifest> {
  const checkedAt = new Date().toISOString();
  const rows: PilotArchiveHeadRow[] = [];

  for (const a of OPENCPN_PILOT_ARCHIVES) {
    const p = await probeUrl(a.downloadUrl);
    rows.push({
      id: a.id,
      checkedAt,
      ...p,
    });
  }

  const md5 = await probeUrl(OPENCPN_PILOT_MD5_URL);
  rows.push({
    id: "md5",
    checkedAt,
    ...md5,
  });

  return { checkedAt, rows };
}
