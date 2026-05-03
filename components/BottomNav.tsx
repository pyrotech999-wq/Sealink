"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ManOverboardAlertButton } from "@/components/home/ManOverboardAlertButton";
import { getBroadcastAlertsSilenced, setBroadcastAlertsSilenced } from "@/lib/broadcast-alert-preferences";
import { suppressMessagingChromePath } from "@/lib/messaging-chrome-paths";

/** Bottom strip: MOB + broadcast silence only (main nav is in TopNav). */
export function BottomNav() {
  const pathname = usePathname();
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

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md"
      aria-label="Safety and alert sound"
    >
      <div className="border-zinc-800/90 bg-zinc-950 px-2 py-2">
        <ManOverboardAlertButton signedIn={signedIn} variant="dock" />
      </div>
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
