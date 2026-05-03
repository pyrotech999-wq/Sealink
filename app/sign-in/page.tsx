import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in | SeaLink",
  description: "Sign in to SeaLink",
};

export default function SignInPage() {
  return (
    <div className="flex flex-1 flex-col bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            SeaLink
          </Link>
          <Link
            href="/sign-up"
            className="text-sm font-medium text-green-800 hover:underline dark:text-green-400"
          >
            Create account
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mb-8 text-center sm:text-left">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Sign in</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Use the email and password you registered with. If you can&apos;t remember your password, use{" "}
            <strong className="text-zinc-800 dark:text-zinc-200">Forgotten password</strong> for a reset link.
          </p>
        </div>

        <SignInForm />

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          New here?{" "}
          <Link href="/sign-up" className="font-medium text-green-800 hover:underline dark:text-green-400">
            Create an account
          </Link>
        </p>
      </main>
    </div>
  );
}
