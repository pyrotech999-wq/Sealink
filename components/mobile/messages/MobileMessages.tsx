'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { MapBroadcastPanel } from '@/components/home/MapBroadcastPanel';
import { DEFAULT_MAP_CENTER } from '@/lib/map-constants';
import { getLastKnownPosition } from '@/lib/map-last-known';
import { getShareOnMap } from '@/lib/map-profile-storage';
import { setMessagingLastVisitNow } from '@/lib/messaging-last-visit';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface Props {
  signedIn: boolean;
  canSendGlobalBroadcast: boolean;
}

function MobileMessagesInner({ signedIn, canSendGlobalBroadcast }: Props) {
  const searchParams = useSearchParams();
  const openPeer = searchParams.get('open')?.trim() || null;

  const [sharing, setSharing] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setMessagingLastVisitNow();
  }, []);

  useEffect(() => {
    const sync = () => {
      setSharing(getShareOnMap());
      setTick((n) => n + 1);
    };
    sync();
    const id = window.setInterval(sync, 1500);
    window.addEventListener('storage', sync);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const last = typeof window !== 'undefined' ? getLastKnownPosition() : null;
  const readLat = last?.lat ?? DEFAULT_MAP_CENTER.lat;
  const readLng = last?.lng ?? DEFAULT_MAP_CENTER.lng;
  const canSend = Boolean(sharing && last);
  const sendLat = canSend ? last!.lat : null;
  const sendLng = canSend ? last!.lng : null;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#071b36] text-white overflow-hidden">
      {/* Nav Header */}
      <div className="pt-[calc(env(safe-area-inset-top)+1rem)] px-4 pb-4 bg-[#0a192f]/80 border-b border-white/[0.06] backdrop-blur-md shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] active:bg-white/[0.08] border border-white/[0.06] text-zinc-300 active:scale-95 transition-all"
            aria-label="Back to home"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight text-slate-100">
              Messages
            </h1>
            <p className="text-[9px] text-zinc-500">
              Direct links & area broadcasts
            </p>
          </div>
        </div>
      </div>

      {/* Shared MapBroadcastPanel — same API logic as web, mobile layout="messaging" */}
      <div className="flex-1 overflow-y-auto">
        <MapBroadcastPanel
          signedIn={signedIn}
          canSendGlobalBroadcast={canSendGlobalBroadcast}
          readLat={readLat}
          readLng={readLng}
          canSend={canSend}
          sendLat={sendLat}
          sendLng={sendLng}
          layout="messaging"
          initialOpenPeerUid={openPeer}
        />
      </div>

      {/* Safe-area bottom spacer */}
      <div
        className="shrink-0 bg-[#071b36]"
        style={{ height: 'calc(var(--sealink-bottom-dock-px, 0px) + env(safe-area-inset-bottom))' }}
      />
    </div>
  );
}

export default function MobileMessages({ signedIn, canSendGlobalBroadcast }: Props) {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center bg-[#071b36]">
        <span className="text-sm text-slate-400 animate-pulse">Loading messages…</span>
      </div>
    }>
      <MobileMessagesInner signedIn={signedIn} canSendGlobalBroadcast={canSendGlobalBroadcast} />
    </Suspense>
  );
}
