"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { NAV_ITEMS } from "@/components/nav-items";
import { getBroadcastAlertsSilenced, setBroadcastAlertsSilenced } from "@/lib/broadcast-alert-preferences";

export function BottomNav() {
  const pathname = usePathname();
  const [silenced, setSilenced] = useState(() =>
    typeof window !== "undefined" ? getBroadcastAlertsSilenced() : false,
  );

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md"
      aria-label="Main navigation and alert sound"
    >
      <nav className="pt-1" aria-label="Main">
        <ul className="mx-auto flex max-w-2xl">
          {NAV_ITEMS.map((item) => {
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
                    active ? "text-green-400" : "text-zinc-400 hover:text-zinc-100"
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
    </div>
  );
}
