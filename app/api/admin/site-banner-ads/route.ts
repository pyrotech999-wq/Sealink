import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { adminListSiteBannerAds, adminSaveSiteBannerAds, SITE_BANNER_ADS_MAX } from "@/lib/site-banner-ads-store";

export const runtime = "nodejs";

export async function GET() {
  const u = await requireAuthUser().catch(() => null);
  if (!u?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const ads = await adminListSiteBannerAds();
    return NextResponse.json({
      ads: ads.map((a) => ({
        id: a.id,
        imageUrl: a.imageUrl,
        linkUrl: a.linkUrl,
        altText: a.altText,
        sortOrder: a.sortOrder,
        enabled: a.enabled,
        updatedAt: a.updatedAt,
      })),
      max: SITE_BANNER_ADS_MAX,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PutBody = {
  ads?: Array<{
    id?: string;
    imageUrl?: string;
    linkUrl?: string;
    altText?: string;
    sortOrder?: number;
    enabled?: boolean;
  }>;
};

export async function PUT(req: Request) {
  const u = await requireAuthUser().catch(() => null);
  if (!u?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = Array.isArray(body.ads) ? body.ads : [];
  const out = await adminSaveSiteBannerAds(
    raw.map((r, i) => ({
      id: typeof r.id === "string" ? r.id : undefined,
      imageUrl: typeof r.imageUrl === "string" ? r.imageUrl : "",
      linkUrl: typeof r.linkUrl === "string" ? r.linkUrl : "",
      altText: typeof r.altText === "string" ? r.altText : "",
      sortOrder: typeof r.sortOrder === "number" ? r.sortOrder : i,
      enabled: r.enabled !== false,
    })),
  );

  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
  return NextResponse.json({ ok: true as const });
}
