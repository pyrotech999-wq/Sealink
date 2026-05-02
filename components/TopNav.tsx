"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/components/nav-items";

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)] backdrop-blur"
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
