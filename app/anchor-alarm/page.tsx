import type { Metadata } from "next";
import { HomeHeader } from "@/components/HomeHeader";
import { HomeLocationMapLoader } from "@/components/home/HomeLocationMapLoader";
import { SeaLinkBrandFooter } from "@/components/SeaLinkBrandFooter";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Anchor alarm",
  description: "Arm a geofence and get drift alerts while SeaLink is open.",
};

export default async function AnchorAlarmPage() {
  const authUser = await getAuthUser();
  const signedIn = Boolean(authUser);

  return (
    <div className="flex flex-1 flex-col bg-black">
      <HomeHeader signedIn={signedIn} isAdmin={authUser?.isAdmin ?? false} />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Anchor alarm</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Share your position on the map, then arm a circular geofence at your GPS fix. While armed, SeaLink can warn you
          if the monitored device moves outside the ring (this tab should stay open). Your home map still shows a quick
          ON/OFF status — open this page for full settings.
        </p>

        <HomeLocationMapLoader
          signedIn={signedIn}
          anchorPlacement="full"
          showHomeMapExtras={false}
          showNearbyFriends={false}
        />

        <SeaLinkBrandFooter />
      </main>
    </div>
  );
}
