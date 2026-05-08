import { NextResponse } from "next/server";
import { listPublicSiteBannerAds } from "@/lib/site-banner-ads-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ads = await listPublicSiteBannerAds();
    return NextResponse.json({
      ads: ads.map((a) => ({
        id: a.id,
        imageUrl: a.imageUrl,
        linkUrl: a.linkUrl,
        altText: a.altText || "Advertisement",
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load banners";
    return NextResponse.json({ error: msg, ads: [] }, { status: 500 });
  }
}
