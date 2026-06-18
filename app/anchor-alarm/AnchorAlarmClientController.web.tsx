'use client';

import { HomeHeader } from '@/components/HomeHeader';
import { HomeLocationMapLoader } from '@/components/home/HomeLocationMapLoader';
import { SeaLinkBrandFooter } from '@/components/SeaLinkBrandFooter';

interface Props {
  signedIn: boolean;
  isAdmin: boolean;
}

export function AnchorAlarmWebUI({ signedIn, isAdmin }: Props) {
  return (
    <div className="flex flex-1 flex-col bg-black min-h-screen">
      <HomeHeader signedIn={signedIn} isAdmin={isAdmin} />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          Anchor alarm
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Share your position on the map, then arm a circular geofence at your
          GPS fix. While armed, SeaLink can warn you if the monitored device
          moves outside the ring (this tab should stay open).
        </p>

        <HomeLocationMapLoader
          signedIn={signedIn}
          isAdmin={isAdmin}
          anchorPlacement="full"
          showHomeMapExtras={false}
          showNearbyFriends={false}
        />

        <SeaLinkBrandFooter />
      </main>
    </div>
  );
}
