"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ManOverboardAlertButton } from "@/components/home/ManOverboardAlertButton";
import { SiteBannerAdStrip } from "@/components/SiteBannerAdStrip";
import { getBroadcastAlertsSilenced, setBroadcastAlertsSilenced } from "@/lib/broadcast-alert-preferences";
import { isBareMetaDataDeletionPage, suppressMessagingChromePath } from "@/lib/messaging-chrome-paths";
import { showSiteBannerAdPath } from "@/lib/site-banner-ad-paths";

/** Bottom strip: MOB + optional rotating banner + broadcast silence (main nav is in TopNav). */
export function BottomNav() {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const [silenced, setSilenced] = useState(() =>
    typeof window !== "undefined" ? getBroadcastAlertsSilenced() : false,
  );
  const [signedIn, setSignedIn] = useState(false);

  const refreshSession = useCallback(() => {
    void fetch("/api/demo/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        const d = (await r.json()) as { signedIn?: boolean };
        setSignedIn(Boolean(d.signedIn));
      })
      .catch(() => setSignedIn(false));
  }, []);

  useEffect(() => {
    refreshSession();
  }, [pathname, refreshSession]);

  useLayoutEffect(() => {
    if (isBareMetaDataDeletionPage(pathname)) {
      document.documentElement.style.setProperty("--sealink-bottom-dock-px", "0");
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const apply = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty("--sealink-bottom-dock-px", String(Math.max(0, Math.ceil(h))));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [pathname, signedIn, silenced]);

  if (isBareMetaDataDeletionPage(pathname)) return null;

  const showBannerSlot = showSiteBannerAdPath(pathname);

  return (
    <div
      ref={rootRef}
      className="fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md"
      aria-label="Safety and alert sound"
    >
      <div className="border-zinc-800/90 bg-zinc-950 px-2 py-2">
        <ManOverboardAlertButton signedIn={signedIn} variant="dock" />
      </div>
      {showBannerSlot ? (
        <div className="border-t border-zinc-800/90 bg-zinc-900/80 px-2 py-1.5">
          <p className="mb-1 text-center text-[9px] font-medium uppercase tracking-wide text-zinc-500">Sponsored</p>
          <SiteBannerAdStrip />
        </div>
      ) : null}
      {signedIn && !suppressMessagingChromePath(pathname) ? (
        <div className="border-t border-zinc-800/90 bg-zinc-950 px-2 py-1.5">
          <label className="flex cursor-pointer items-center justify-center gap-2 text-[10px] font-medium leading-snug text-zinc-400 sm:text-[11px] sm:justify-start">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 shrink-0 rounded border-zinc-600 text-zinc-500 accent-zinc-500"
              checked={silenced}
              onChange={(e) => {
                const on = e.target.checked;
                setSilenced(on);
                setBroadcastAlertsSilenced(on);
              }}
              aria-label="Silence sound for new broadcast message alerts"
            />
            <span>Silence message alerts (no sound)</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
