import { cookies } from "next/headers";
import { HomeHeader } from "@/components/HomeHeader";
import { HomeLocationMapLoader } from "@/components/home/HomeLocationMapLoader";
import { SeaLinkBrandFooter } from "@/components/SeaLinkBrandFooter";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";
import { canSendGlobalAreaBroadcast, getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MapSharingSettingsPage() {
  const jar = await cookies();
  const signedIn = jar.get(DEMO_SESSION_COOKIE)?.value === DEMO_SESSION_VALUE;
  const authUser = await getAuthUser();
  const canSendGlobalBroadcast = authUser ? canSendGlobalAreaBroadcast(authUser.email) : false;

  return (
    <div className="flex flex-1 flex-col bg-black">
      <HomeHeader signedIn={signedIn} isAdmin={authUser?.isAdmin ?? false} />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Map sharing</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Set your pin details and the three sharing options, then use the green or grey button to turn GPS sharing on
          or off. The live map is on the home page.
        </p>

        <HomeLocationMapLoader
          signedIn={signedIn}
          canSendGlobalBroadcast={canSendGlobalBroadcast}
          sharingUiMode="settings"
        />

        <SeaLinkBrandFooter />
      </main>
    </div>
  );
}
