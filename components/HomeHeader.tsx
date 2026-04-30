"use client";

import Link from "next/link";
import { useState } from "react";

type Props = { signedIn: boolean };

export function HomeHeader({ signedIn }: Props) {
  const [busy, setBusy] = useState(false);

  async function signOutDemo() {
    setBusy(true);
    try {
      await fetch("/api/demo/sign-out", { method: "POST" });
      window.location.assign("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          <span
            aria-hidden
            className="inline-flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-emerald-500 shadow-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3c3.9 0 7 3.1 7 7 0 5-7 11-7 11S5 15 5 10c0-3.9 3.1-7 7-7Z"
                stroke="white"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="M9.5 10.5l1.7 1.7 3.8-3.8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-base">SeaLink</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/payment"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            Plans
          </Link>
          {signedIn ? (
            <>
              <span className="hidden text-xs text-zinc-500 sm:inline dark:text-zinc-400">Signed in</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void signOutDemo()}
                className="text-sm font-medium text-zinc-700 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-300 dark:hover:text-white"
              >
                {busy ? "…" : "Sign out"}
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </header>
  );
}
