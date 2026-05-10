"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  bindSessionProfileEmailFromServer,
  clearPerUserClientStorage,
  clearSessionProfileEmailBinding,
} from "@/lib/session-profile-client";

/**
 * Keeps localStorage map/anchor caches aligned with the signed-in account (email from `/api/demo/me`).
 * Fixes stale boat name / pin / anchor state when a different user signs in on the same browser.
 */
export function SessionProfileEmailSync() {
  const pathname = usePathname();

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/demo/me", { credentials: "same-origin", cache: "no-store" });
        if (!r.ok) return;
        const ct = r.headers.get("content-type");
        if (!ct?.includes("application/json")) return;
        const j = (await r.json()) as { signedIn?: boolean; email?: string };
        if (j.signedIn === true && typeof j.email === "string" && j.email.trim()) {
          bindSessionProfileEmailFromServer(j.email);
        } else {
          clearSessionProfileEmailBinding();
          clearPerUserClientStorage();
        }
      } catch {
        /* ignore */
      }
    })();
  }, [pathname]);

  return null;
}
