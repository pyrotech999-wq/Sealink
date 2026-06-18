"use client";

import Link from "next/link";
import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import { SignInForm } from "./SignInForm";
import MobileSignInForm from "@/components/mobile/auth/MobileSignInForm";

export default function SignInSwitcher() {
  const { isMobile, mounted } = useIsMobileApp();

  if (!mounted) {
    // Default desktop loader / placeholder before hydration
    return (
      <div className="flex flex-1 flex-col bg-black min-h-screen">
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-sm h-64 animate-pulse" />
        </main>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col bg-[#071b36] text-white">
        {/* Header */}
        <header className="shrink-0 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3 bg-[#071b36]">
          <div className="flex items-center justify-between">
            <h1 className="text-[26px] font-extrabold tracking-tight">SeaLink</h1>
            <Link
              href="/sign-up"
              className="text-xs font-bold text-slate-400 bg-white/[0.05] border border-white/[0.08] px-3.5 py-1.5 rounded-full hover:bg-white/[0.1]"
            >
              Sign Up
            </Link>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 flex flex-col justify-center px-5 py-6">
          <div className="mb-5">
            <h2 className="text-xl font-extrabold text-white tracking-tight">Sign In</h2>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Access your navigation logs, circle coordinates, and anchor alerts.
            </p>
          </div>

          <MobileSignInForm />

          <p className="mt-6 text-center text-xs text-slate-400">
            Need an account?{" "}
            <Link href="/sign-up" className="font-bold text-cyan-400 hover:underline">
              Create crew profile
            </Link>
          </p>
        </main>
      </div>
    );
  }

  // Original desktop layout unchanged
  return (
    <div className="flex flex-1 flex-col bg-black min-h-screen">
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
