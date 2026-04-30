"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/components/nav-items";

export function TopNav() {
  const pathname = usePathname();
  return (
    <nav
      className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90"
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-5xl gap-1 px-2 py-1 sm:px-6">
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
    </nav>
  );
}

