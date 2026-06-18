"use client";

import Link from "next/link";
import { HomeLocationMapLoader } from "@/components/home/HomeLocationMapLoader";
import { Radio } from "lucide-react";

export default function MobileMapSharingClient({
  signedIn,
  isAdmin,
}: {
  signedIn: boolean;
  isAdmin: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#030816] via-[#09152a] to-[#020510] text-white p-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* Header row */}
      <div className="shrink-0 flex items-center justify-between pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 border-b border-white/[0.05]">
        <Link
          href="/"
          className="text-xs font-bold text-slate-400 bg-white/[0.05] border border-white/[0.08] px-3.5 py-1.5 rounded-full hover:bg-white/[0.1] active:scale-95 transition-all"
        >
          ← Back to Map
        </Link>
        <div className="flex items-center gap-1.5">
          <Radio size={14} className="text-cyan-400 animate-pulse" />
          <span className="text-[10px] font-bold tracking-widest uppercase text-cyan-400">Telemetry Node</span>
        </div>
      </div>

      {/* Title block */}
      <div className="py-5 shrink-0">
        <h1 className="text-lg font-extrabold tracking-tight text-white">Location Broadcast</h1>
        <p className="text-[11px] text-slate-400 mt-1 max-w-xs leading-relaxed">
          Configure how your vessel pin, crew status, and GPS coordinates are broadcasted on the live marine radar.
        </p>
      </div>

      {/* Main settings content */}
      <main className="flex-1 flex flex-col justify-start">
        <HomeLocationMapLoader signedIn={signedIn} isAdmin={isAdmin} sharingUiMode="settings" />
      </main>
    </div>
  );
}
