"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_ITEMS } from "@/components/nav-items";

export function TopNav() {
  const pathname = usePathname();
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/demo/me", { credentials: "same-origin" })
      .then((r) => r.json() as Promise<{ signedIn?: boolean }>)
      .then((d) => {
        if (!cancelled && d?.signedIn === true) setShowProfile(true);
      })
      .catch(() => {
        /* */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav
      className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-2 py-1 sm:px-6">
        <ul className="flex min-w-0 flex-1 flex-wrap gap-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/" || pathname === ""
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href} className="min-w-0">
                <Link
                  href={item.href}
                  title={item.sub ? `${item.label} — ${item.sub}` : item.label}
                  className={`inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-green-600 text-white"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
                  }`}
                >
                  {item.short}
                </Link>
              </li>
            );
          })}
        </ul>
        {showProfile ? (
          <Link
            href="/profile"
            className={`inline-flex h-9 shrink-0 items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors ${
              pathname === "/profile" || pathname.startsWith("/profile/")
                ? "bg-green-600 text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
            }`}
          >
            Profile
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

