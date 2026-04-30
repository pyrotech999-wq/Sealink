import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "./ui";

export const metadata: Metadata = {
  title: "Reset password | SeaLink",
  description: "Set a new password for your account",
};

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-100 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            SeaLink
          </Link>
          <Link href="/sign-in" className="text-sm font-medium text-green-800 hover:underline dark:text-green-400">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Reset password</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Choose a new password. Your reset link expires after 30 minutes.
          </p>
        </div>
        <ResetPasswordForm />
      </main>
    </div>
  );
}

