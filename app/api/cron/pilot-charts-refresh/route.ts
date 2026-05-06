import { NextResponse } from "next/server";

import { canUseKv, kvSetJson } from "@/lib/kv-json";
import { buildPilotArchivesManifest } from "@/lib/navigation-charts/pilot-charts-head-probe";
import { PILOT_CHARTS_KV_KEY } from "@/lib/navigation-charts/pilot-charts-manifest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const q = new URL(req.url).searchParams.get("secret");
  if (q && q === secret) return true;
  return false;
}

/**
 * Vercel Cron (1st & 4th of month): probes OpenCPN pilot .7z URLs and stores Last-Modified / size in KV.
 * Configure `CRON_SECRET` in Vercel and the same value in the cron `vercel.json` auth, or call with `?secret=`.
 */
export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canUseKv()) {
    return NextResponse.json(
      {
        ok: false,
        error: "KV not configured (KV_REST_API_URL / KV_REST_API_TOKEN). Manifest cannot be stored.",
      },
      { status: 503 },
    );
  }

  const manifest = await buildPilotArchivesManifest();
  await kvSetJson(PILOT_CHARTS_KV_KEY, manifest);

  return NextResponse.json({
    ok: true,
    checkedAt: manifest.checkedAt,
    count: manifest.rows.length,
  });
}
