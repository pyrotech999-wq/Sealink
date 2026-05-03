import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = {
  title: "Create account | SeaLink",
  description: "Join SeaLink — family-style location sharing, circle invites, and safety preferences",
};

export default function SignUpPage() {
  return (
    <div className="flex flex-1 flex-col bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            SeaLink
          </Link>
          <Link
            href="/sign-in"
            className="text-sm font-medium text-green-800 hover:underline dark:text-green-400"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Create your account</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Continue with Google when it&apos;s enabled, or set up your profile, home details, and password — then choose
            how SeaLink can use location, Bluetooth, and notifications, invite your Circle, and share the app.
          </p>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Already registered?{" "}
            <Link href="/sign-in" className="font-medium text-green-800 hover:underline dark:text-green-400">
              Sign in
            </Link>
          </p>
        </div>

        <SignUpForm />

        <p className="mt-8 text-center text-xs text-zinc-500">
          Location and background behaviour ultimately follow your phone settings when you use the native app.
        </p>
      </main>
    </div>
  );
}
