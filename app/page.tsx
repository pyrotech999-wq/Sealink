import { cookies } from "next/headers";
import { HomeHeader } from "@/components/HomeHeader";
import { HomeMainCtas } from "@/components/HomeMainCtas";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";

export default async function Home() {
  const jar = await cookies();
  const signedIn = jar.get(DEMO_SESSION_COOKIE)?.value === DEMO_SESSION_VALUE;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <HomeHeader signedIn={signedIn} />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Stay linked</h1>
        <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">
          SeaLink is set up like a family safety app: profile and Circle invites, location preference (always vs while
          using), Bluetooth, smart notifications, and sharing — the same kind of onboarding flow apps such as Life360
          walk you through. SeaLink is not affiliated with Life360.
        </p>
        {signedIn ? (
          <p className="mt-4 text-sm text-green-800 dark:text-green-300">
            You&apos;re in a <strong>demo session</strong> (no real auth yet). Use the bottom tabs or the buttons below.
          </p>
        ) : null}
        <HomeMainCtas signedIn={signedIn} />
      </main>
    </div>
  );
}
