"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { NAV_ITEMS } from "@/components/nav-items";
import { suppressMessagingChromePath } from "@/lib/messaging-chrome-paths";

export function TopNav() {
  const pathname = usePathname();
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

  const showMessagesTab = signedIn && !suppressMessagingChromePath(pathname);

  const navItems = NAV_ITEMS.filter((item) => item.href !== "/messaging" || showMessagesTab);

  return (
    <nav
      className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)] backdrop-blur"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-5xl items-stretch gap-1 px-1 py-1 sm:gap-2 sm:px-4 sm:py-1.5 md:px-6">
        <ul className="flex min-h-[2.25rem] min-w-0 flex-1 flex-nowrap gap-0.5 sm:gap-1">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/" || pathname === ""
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`) ||
                  Boolean(item.alsoActiveFor?.some((p) => pathname === p || pathname.startsWith(`${p}/`)));
            return (
              <li key={item.href} className="flex min-w-0 flex-1 basis-0">
                <Link
                  href={item.href}
                  title={item.sub ? `${item.label} — ${item.sub}` : item.label}
                  className={`flex h-full min-h-9 w-full min-w-0 items-center justify-center whitespace-nowrap rounded-md px-0.5 text-center text-[10px] font-semibold leading-none transition-colors min-[400px]:px-1 min-[400px]:text-[11px] sm:min-h-10 sm:rounded-lg sm:px-2.5 sm:text-sm ${
                    active
                      ? "bg-green-600 text-white"
                      : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
                  }`}
                >
                  {item.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
