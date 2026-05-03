"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const SKIP_PREFIXES = [
  "/profile",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/terms",
  "/privacy",
  "/help",
  "/delete-data",
  "/delete-account",
  "/delete-my-data",
  "/admin",
];

function shouldSkip(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true;
  for (const p of SKIP_PREFIXES) {
    if (pathname === p || pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

/**
 * When Supabase is in use, signed-in users must have `profiles.full_name` (≥2 chars).
 * Redirects to `/profile?required=1` until satisfied.
 */
export function ProfileNameGate() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (shouldSkip(pathname)) return;

    let cancelled = false;
    void (async () => {
      try {
        const me = await fetch("/api/demo/me", { credentials: "same-origin", cache: "no-store" });
        const md = (await me.json()) as { signedIn?: boolean };
        if (cancelled || !md.signedIn) return;

        const r = await fetch("/api/profiles/me", { credentials: "same-origin", cache: "no-store" });
        const d = (await r.json()) as { supabase?: boolean; needsDisplayName?: boolean };
        if (cancelled) return;
        if (d.supabase === false) return;
        if (!d.needsDisplayName) return;

        const onProfile = pathname.startsWith("/profile");
        const already = searchParams.get("required") === "1";
        if (onProfile && already) return;

        router.replace("/profile?required=1");
      } catch {
        /* */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams]);

  return null;
}
