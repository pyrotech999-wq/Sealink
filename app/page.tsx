import { cookies } from "next/headers";
import { HomeHeader } from "@/components/HomeHeader";
import { HomeLocationMapLoader } from "@/components/home/HomeLocationMapLoader";
import { HomeMainCtas } from "@/components/HomeMainCtas";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";

export default async function Home() {
  const jar = await cookies();
  const signedIn = jar.get(DEMO_SESSION_COOKIE)?.value === DEMO_SESSION_VALUE;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <HomeHeader signedIn={signedIn} />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Stay linked</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Your home screen includes a live map: share your GPS position, show your boat name and profile photo on the
          pin, and keep slower background updates on by default while the tab stays open (you can pause on the map).
          Fully closed browsers cannot keep GPS on a normal website — that needs a native wrapper app.
        </p>
        {signedIn ? (
          <p className="mt-4 text-sm text-green-800 dark:text-green-300">
            You&apos;re in a <strong>demo session</strong> (no real auth yet). Use the bottom tabs or the buttons below.
          </p>
        ) : null}

        <HomeLocationMapLoader />

        <HomeMainCtas signedIn={signedIn} />
      </main>
    </div>
  );
}
