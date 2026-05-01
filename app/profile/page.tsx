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

export default async function ProfilePage() {
  const jar = await cookies();
  const signedIn = jar.get(DEMO_SESSION_COOKIE)?.value === DEMO_SESSION_VALUE;
  const raw = jar.get(AUTH_EMAIL_COOKIE)?.value ?? "";
  const accountEmail = signedIn ? normaliseEmail(raw) : "";

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
          Update the name, boat, phone, and photo used on your map pin. This information stays in your browser unless you
          use features that send it with location (same as sign-up).
        </p>

        <ProfileEditForm signedIn={signedIn} accountEmail={accountEmail} />
      </main>
    </div>
  );
}
