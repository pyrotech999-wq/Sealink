"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SITE_BANNER_MAX_HEIGHT_REM } from "@/lib/site-banner-ads-constants";
import { showSiteBannerAdPath } from "@/lib/site-banner-ad-paths";

const ROT_PATH_KEY = "sealink_site_banner_rot_path";
const ROT_IDX_KEY = "sealink_site_banner_rot_idx";

type Ad = { id: string; imageUrl: string; linkUrl: string; altText: string };

/**
 * Bottom-dock sponsor slot: fetches public ads, rotates by navigation.
 * Returns null when there are no ads (no empty “Sponsored” strip).
 */
export function SiteBannerAdStrip() {
  const pathname = usePathname() || "/";
  const [ads, setAds] = useState<Ad[]>([]);
  const [index, setIndex] = useState(0);
  const [fetchDone, setFetchDone] = useState(false);

  const visible = showSiteBannerAdPath(pathname);

  useEffect(() => {
    if (!visible) {
      setFetchDone(false);
      setAds([]);
      return;
    }
    setFetchDone(false);
    let cancelled = false;
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await fetch("/api/site-banner-ads", { credentials: "same-origin", cache: "no-store", signal: ac.signal });
        const d = (await r.json()) as { ads?: Ad[]; error?: string };
        if (cancelled) return;
        const list = Array.isArray(d.ads) ? d.ads.filter((a) => a?.imageUrl && a?.linkUrl) : [];
        setAds(list);
      } catch {
        if (!cancelled) setAds([]);
      } finally {
        if (!cancelled) setFetchDone(true);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [visible, pathname]);

  useEffect(() => {
    if (!visible || ads.length === 0) return;
    try {
      const prevPath = sessionStorage.getItem(ROT_PATH_KEY);
      let idx = 0;
      if (prevPath === null) {
        idx = 0;
      } else if (prevPath !== pathname) {
        const prevIdx = parseInt(sessionStorage.getItem(ROT_IDX_KEY) || "0", 10);
        const base = Number.isFinite(prevIdx) && prevIdx >= 0 ? prevIdx : 0;
        idx = (base + 1) % ads.length;
      } else {
        const cur = parseInt(sessionStorage.getItem(ROT_IDX_KEY) || "0", 10);
        idx = Number.isFinite(cur) && cur >= 0 ? cur % ads.length : 0;
      }
      sessionStorage.setItem(ROT_PATH_KEY, pathname);
      sessionStorage.setItem(ROT_IDX_KEY, String(idx));
      setIndex(idx);
    } catch {
      setIndex(0);
    }
  }, [visible, pathname, ads]);

  const current = useMemo(() => {
    if (ads.length === 0) return null;
    return ads[index % ads.length] ?? ads[0] ?? null;
  }, [ads, index]);

  if (!visible || !fetchDone || ads.length === 0 || !current) return null;

  const maxH = `${SITE_BANNER_MAX_HEIGHT_REM}rem`;

  return (
    <div className="border-t border-zinc-800/90 bg-zinc-900/80 px-2 py-1.5">
      <p className="mb-1 text-center text-[9px] font-medium uppercase tracking-wide text-zinc-500">Sponsored</p>
      <div className="flex w-full justify-center px-1">
        <a
          href={current.linkUrl}
          target="_blank"
          rel="noopener noreferrer nofollow sponsored"
          className="flex max-w-full items-center justify-center rounded-lg outline-none ring-zinc-500/0 transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label={current.altText || "Sponsored link"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- remote admin URLs; dimensions unknown */}
          <img
            src={current.imageUrl}
            alt={current.altText || ""}
            className="h-auto w-auto max-w-full object-contain"
            style={{ maxHeight: maxH }}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </a>
      </div>
    </div>
  );
}
