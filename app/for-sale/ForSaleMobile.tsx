// app/for-sale/ForSaleMobile.tsx
'use client';

import Link from 'next/link';
import { Ship, Anchor, ArrowLeft, ChevronRight, ShieldAlert } from 'lucide-react';

export default function ForSaleMobile() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#071426] via-[#040c18] to-[#020610] text-white safe-top safe-bottom flex flex-col overflow-x-hidden">

      {/* FIXED HEADER (Immersive Cockpit Header) */}
      <div className="p-4 bg-[#0a192f]/80 border-b border-white/[0.06] backdrop-blur-md shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] active:bg-white/[0.08] border border-white/[0.06] text-zinc-300 active:scale-95 transition-all"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight text-slate-100 flex items-center gap-1.5 text-left">
              <Ship className="size-4 text-emerald-400" />
              <span>Buy &amp; Sell</span>
            </h1>
            <p className="text-[9px] text-zinc-500 text-left">
              Vessels and marine equipment listings
            </p>
          </div>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto p-4 max-w-md mx-auto w-full space-y-4 pb-24 text-left">

        {/* BOATS FOR SALE CARD */}
        <Link
          href="/vessels"
          className="group relative block overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-5 active:scale-[0.99] hover:border-white/10 transition-all shadow-lg text-left"
        >
          {/* Subtle radial emerald glow overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent opacity-30 pointer-events-none" />

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold tracking-wide text-emerald-400 uppercase">
                Listings
              </span>

              <h2 className="mt-3 text-lg font-extrabold text-slate-100 group-hover:text-emerald-400 transition-colors">
                Boats for Sale
              </h2>

              <p className="mt-1.5 text-xs text-slate-400 leading-normal">
                Browse paid boat listings, check vessel specifications, or post your boat for sale.
              </p>
            </div>

            <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 shadow-inner">
              <Ship className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-[10px] font-bold text-emerald-400 group-hover:underline">
            <span>Browse Boats</span>
            <ChevronRight size={12} />
          </div>
        </Link>

        {/* BOAT GEAR CARD */}
        <Link
          href="/gear"
          className="group relative block overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-5 active:scale-[0.99] hover:border-white/10 transition-all shadow-lg text-left"
        >
          {/* Subtle radial sky blue glow overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-transparent to-transparent opacity-30 pointer-events-none" />

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center rounded-full bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[9px] font-bold tracking-wide text-sky-400 uppercase">
                Marketplace
              </span>

              <h2 className="mt-3 text-lg font-extrabold text-slate-100 group-hover:text-sky-400 transition-colors">
                Boat Gear
              </h2>

              <p className="mt-1.5 text-xs text-slate-400 leading-normal">
                Buy and sell marine equipment, rigging, spare hardware, accessories, and sails.
              </p>
            </div>

            <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-xl bg-sky-950/40 border border-sky-500/20 text-sky-400 shadow-inner">
              <Anchor className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-[10px] font-bold text-sky-400 group-hover:underline">
            <span>Open Gear Marketplace</span>
            <ChevronRight size={12} />
          </div>
        </Link>

        {/* Safe Trading Guidelines Card */}
        <div className="p-4 rounded-2xl border border-white/[0.04] bg-[#091220]/80 shadow-md space-y-2.5">
          <div className="flex items-center gap-2 text-amber-400">
            <ShieldAlert size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Trading Safe Zone</span>
          </div>
          <p className="text-[10px] leading-relaxed text-zinc-500">
            Always inspect vessels and gear in person. Meet in secure public areas such as yacht clubs, marinas, or harbors. SeaLink provides listing services and does not process payments or guarantee transactions.
          </p>
        </div>

      </div>
    </div>
  );
}