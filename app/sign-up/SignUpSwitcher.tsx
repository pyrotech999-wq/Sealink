"use client";

import Link from "next/link";
import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import { SignUpForm } from "./SignUpForm";
import MobileSignUpForm from "@/components/mobile/auth/MobileSignUpForm";

export default function SignUpSwitcher() {
  const { isMobile, mounted } = useIsMobileApp();

  if (!mounted) {
    // Default desktop loader / placeholder before hydration
    return (
      <div className="flex flex-1 flex-col bg-black min-h-screen">
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-sm h-96 animate-pulse" />
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
              href="/sign-in"
              className="text-xs font-bold text-slate-400 bg-white/[0.05] border border-white/[0.08] px-3.5 py-1.5 rounded-full hover:bg-white/[0.1]"
            >
              Sign In
            </Link>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 flex flex-col justify-center px-5 py-6">
          <div className="mb-5">
            <h2 className="text-xl font-extrabold text-white tracking-tight">Create Account</h2>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Register your crew profile, configure safety indicators, and join the map.
            </p>
          </div>

          <MobileSignUpForm />

          <p className="mt-6 text-center text-xs text-slate-400">
            Already registered?{" "}
            <Link href="/sign-in" className="font-bold text-cyan-400 hover:underline">
              Sign In
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
            Set up your profile, home details, and password — then choose how SeaLink can use location, Bluetooth, and
            notifications, invite your Circle, and share the app.
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
