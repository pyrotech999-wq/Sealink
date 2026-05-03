import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AUTH_EMAIL_COOKIE, normaliseEmail } from "@/lib/auth";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";
import { ProfileEditForm } from "./ProfileEditForm";

export const metadata: Metadata = {
  title: "Profile",
  description: "Edit how you appear on the map and your account shortcuts.",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  const jar = await cookies();
  const signedIn = jar.get(DEMO_SESSION_COOKIE)?.value === DEMO_SESSION_VALUE;
  const raw = jar.get(AUTH_EMAIL_COOKIE)?.value ?? "";
  const accountEmail = signedIn ? normaliseEmail(raw) : "";
  const sp = await searchParams;
  const nameRequired = sp.required === "1";

  return (
    <div className="flex flex-1 flex-col bg-black">
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href="/"
          className="text-sm font-medium text-green-800 hover:underline dark:text-green-400"
        >
          ← Home
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Edit profile</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Your <strong className="font-medium text-zinc-800 dark:text-zinc-200">name</strong> is saved to your account (when
          signed in with cloud sync) and used in messages and broadcasts so others see you properly — not a numeric id.
          Boat, phone, and photo still apply on the map as before.
        </p>

        {nameRequired ? (
          <div className="mt-6 rounded-xl border border-amber-600/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
            Add your name below to continue using SeaLink (at least 2 characters), then save.
          </div>
        ) : null}

        <ProfileEditForm signedIn={signedIn} accountEmail={accountEmail} nameRequired={nameRequired} />
      </main>
    </div>
  );
}
