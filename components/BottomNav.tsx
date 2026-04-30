"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: readonly { href: string; label: string; short: string; sub?: string }[] = [
  { href: "/", label: "Home", short: "Home" },
  { href: "/ifm", label: "IFM", short: "IFM", sub: "International Friends Map" },
  { href: "/local-map", label: "Weather & sea", short: "Weather", sub: "Weather & sea" },
  { href: "/gear", label: "Boat gear", short: "Gear", sub: "Buy & sell kit" },
  { href: "/vessels", label: "Vessels for sale", short: "Vessels", sub: "For sale" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95"
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-2xl">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/" || pathname === ""
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                title={item.sub ? `${item.label} — ${item.sub}` : item.label}
                className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-center transition-colors ${
                  active
                    ? "text-green-700 dark:text-green-400"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                <span
                  className={`block h-0.5 w-6 rounded-full sm:w-7 ${active ? "bg-green-600 opacity-100" : "bg-transparent opacity-0"}`}
                  aria-hidden
                />
                <span className="text-[10px] font-semibold leading-tight sm:text-[11px]">{item.short}</span>
                {item.sub ? (
                  <span className="hidden text-[9px] font-normal leading-tight text-zinc-400 sm:block dark:text-zinc-500">
                    {item.sub}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
