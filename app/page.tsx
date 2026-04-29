import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">SeaLink</span>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-green-600 px-3 text-sm font-medium text-white hover:bg-green-700"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Stay linked</h1>
        <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">
          SeaLink is set up like a family safety app: profile and Circle invites, location preference (always vs while
          using), Bluetooth, smart notifications, and sharing — the same kind of onboarding flow apps such as Life360
          walk you through. SeaLink is not affiliated with Life360.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-medium text-white hover:bg-green-700"
          >
            Create account
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
