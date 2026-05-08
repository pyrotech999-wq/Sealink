import { HomeHeader } from "@/components/HomeHeader";
import { HomeLocationMapLoader } from "@/components/home/HomeLocationMapLoader";
import { SeaStateSummaryBox } from "@/components/home/SeaStateSummaryBox";
import { HomeMainCtas } from "@/components/HomeMainCtas";
import { HomeMarinaBookingCta } from "@/components/home/HomeMarinaBookingCta";
import { SeaLinkBrandFooter } from "@/components/SeaLinkBrandFooter";
import { ShareAppLink } from "@/components/home/ShareAppLink";
import { SeasTheDayButton } from "@/components/home/SeasTheDayButton";
import { getAuthUser } from "@/lib/auth";
import { getProfileFirstNameForUser } from "@/lib/profiles-server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const authUser = await getAuthUser();
  /** Match `/api/*` session (demo cookie + email); demo cookie alone is not enough for messaging APIs. */
  const signedIn = Boolean(authUser);
  const welcomeFirstName = authUser ? await getProfileFirstNameForUser(authUser.uid) : null;

  return (
    <div className="flex flex-1 flex-col bg-black">
      <HomeHeader signedIn={signedIn} isAdmin={authUser?.isAdmin ?? false} />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          {signedIn
            ? welcomeFirstName
              ? `Welcome back, ${welcomeFirstName}`
              : "Welcome back"
            : "Stay linked"}
        </h1>
        {!signedIn ? (
          <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-400">
            Your home screen includes a live map: share your GPS position, show your boat name and profile photo on the
            pin, and keep slower background updates on by default while the tab stays open (you can pause on the map).
            Fully closed browsers cannot keep GPS on a normal website — that needs a native wrapper app.
          </p>
        ) : null}
        {signedIn ? (
          <p className="mt-4 text-sm text-green-300">
            You&apos;re signed in. Posting adverts and broadcasts is tied to your account email.
          </p>
        ) : null}

        <div className="mt-4">
          <SeasTheDayButton />
        </div>

        <HomeLocationMapLoader signedIn={signedIn} anchorPlacement="compact" />

        <HomeMainCtas signedIn={signedIn} />

        <SeaStateSummaryBox />

        <ShareAppLink className="mt-8" />

        <HomeMarinaBookingCta className="mt-8" />

        <SeaLinkBrandFooter />
      </main>
    </div>
  );
}
