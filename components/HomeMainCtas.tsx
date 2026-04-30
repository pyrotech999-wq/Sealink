import Link from "next/link";

type Props = { signedIn: boolean };

export function HomeMainCtas({ signedIn }: Props) {
  if (signedIn) {
    return (
      <div className="mt-8 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/local-map"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-medium text-white hover:bg-green-700"
          >
            Open weather & sea
          </Link>
          <Link
            href="/ifm"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            IFM
          </Link>
        </div>
        <Link
          href="/profile"
          className="self-start text-sm font-medium text-green-800 underline-offset-2 hover:underline dark:text-green-400"
        >
          Edit profile
        </Link>
      </div>
    );
  }

  return (
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
  );
}
