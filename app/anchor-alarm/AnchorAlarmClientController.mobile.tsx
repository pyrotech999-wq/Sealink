'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Anchor, Activity, ShieldCheck, ShieldAlert } from 'lucide-react';
import { HomeLocationMapLoader } from '@/components/home/HomeLocationMapLoader';
import { getAnchorAlertConfig, type AnchorAlertConfig } from '@/lib/anchor-alert-storage';

interface Props {
  signedIn: boolean;
  isAdmin: boolean;
}

export function AnchorAlarmMobileUI({ signedIn, isAdmin }: Props) {
  const [anchorCfg, setAnchorCfg] = useState<AnchorAlertConfig | null>(null);

  useEffect(() => {
    // Initial load
    setAnchorCfg(getAnchorAlertConfig({ isAdmin }));

    // Listen for storage changes (e.g. from the modal or background service)
    const handleUpdate = () => {
      setAnchorCfg(getAnchorAlertConfig({ isAdmin }));
    };

    window.addEventListener('storage', handleUpdate);

    // Polling interval to keep UI in sync in case storage events don't fire on the same window
    const interval = setInterval(handleUpdate, 2000);

    return () => {
      window.removeEventListener('storage', handleUpdate);
      clearInterval(interval);
    };
  }, [isAdmin]);

  const isArmed = anchorCfg?.armed ?? false;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#071426] via-[#040c18] to-[#020610] text-white safe-top safe-bottom flex flex-col justify-between overflow-hidden">

      {/* Immersive Cockpit Header */}
      <div className="p-4 bg-[#0a192f]/80 border-b border-white/[0.06] backdrop-blur-md shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] active:bg-white/[0.08] border border-white/[0.06] text-zinc-300 active:scale-95 transition-all"
            aria-label="Back to home"
          >
            <ChevronLeft size={20} />
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Anchor size={16} />
            </span>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-slate-100">
                Anchor Instrument
              </h1>
              <p className="text-[9px] text-zinc-500">
                Geofence monitoring systems
              </p>
            </div>
          </div>
        </div>

        {/* Live Status Badge */}
        <div className="flex items-center gap-1.5">
          <span className={`relative flex h-2 w-2`}>
            {isArmed && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isArmed ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          </span>
          <span className={`text-[10px] font-bold tracking-wider uppercase ${isArmed ? 'text-emerald-400' : 'text-amber-400'}`}>
            {isArmed ? 'Armed' : 'Disarmed'}
          </span>
        </div>
      </div>

      {/* Core Map Panel */}
      <div className="flex-1 relative w-full p-4 flex flex-col min-h-0">
        <div className="flex-1 w-full rounded-3xl overflow-hidden border border-white/[0.08] bg-[#0c182c]/40 shadow-2xl relative flex flex-col p-1">
          <HomeLocationMapLoader
            signedIn={signedIn}
            isAdmin={isAdmin}
            anchorPlacement="full"
            showHomeMapExtras={false}
            showNearbyFriends={false}
          />
        </div>
      </div>

      {/* System Status Dashboard Card */}
      <div className="mx-4 mb-2 p-4 rounded-2xl border border-white/[0.06] bg-[#0d1b2e]/60 backdrop-blur-md shadow-lg space-y-3 shrink-0">
        <div className="flex items-center justify-between border-b border-white/[0.05] pb-2.5">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-zinc-400" />
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">System Telemetry</span>
          </div>
          <span className="text-[9px] font-mono text-zinc-500">
            {anchorCfg?.lat && anchorCfg?.lng ? 'GPS ACTIVE' : 'NO ANCHOR SET'}
          </span>
        </div>

        {isArmed && anchorCfg ? (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-2.5">
              <span className="text-[9px] text-zinc-500 uppercase font-semibold block">Geofence Radius</span>
              <span className="text-sm font-extrabold text-slate-200 mt-1 block">{anchorCfg.radiusM} meters</span>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-2.5">
              <span className="text-[9px] text-zinc-500 uppercase font-semibold block">Bearing Limit</span>
              <span className="text-sm font-extrabold text-slate-200 mt-1 block">
                {anchorCfg.angleDeg >= 360 ? 'Disabled' : `${anchorCfg.angleDeg}°`}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 flex items-center gap-3">
            <ShieldAlert size={18} className="text-amber-500 shrink-0" />
            <p className="text-[11px] leading-relaxed text-zinc-400">
              Alarm is currently inactive. Use the anchor button on the map to set an anchor point and arm the geofence.
            </p>
          </div>
        )}
      </div>

      {/* Immersive Dark Utility Informational Foot-Node */}
      <div className="mx-4 mb-4 p-4 rounded-2xl border border-white/[0.04] bg-[#091220]/80 shadow-md shrink-0">
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Ensure this view container remains open to receive continuous marine drift updates.
          Background tracking configuration alerts remain bound to foreground native service listeners.
        </p>
      </div>
    </div>
  );
}
