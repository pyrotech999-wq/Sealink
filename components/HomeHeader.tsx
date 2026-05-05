"use client";

import Link from "next/link";
import { useState } from "react";
import { invalidateMeSubscriptionCache } from "@/lib/client/me-subscription";
import { invalidateDemoMeCache } from "@/lib/client/demo-me";

type Props = { signedIn: boolean; isAdmin?: boolean };

export function HomeHeader({ signedIn, isAdmin = false }: Props) {
  const [busy, setBusy] = useState(false);

  async function signOutDemo() {
    setBusy(true);
    try {
      await fetch("/api/demo/sign-out", { method: "POST" });
      invalidateMeSubscriptionCache();
      invalidateDemoMeCache();
      window.location.assign("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-50">
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
            className="text-sm font-medium text-zinc-400 hover:text-white"
          >
            Plans
          </Link>
          {isAdmin ? (
            <>
              <Link
                href="/admin/access"
                className="text-sm font-medium text-amber-400/90 hover:text-amber-300"
              >
                Admin
              </Link>
              <Link
                href="/admin/vessel-adverts"
                className="text-sm font-medium text-amber-400/90 hover:text-amber-300"
              >
                Boat ads
              </Link>
            </>
          ) : null}
          {signedIn ? (
            <>
              <span className="hidden text-xs text-zinc-400 sm:inline">Signed in</span>
              <Link
                href="/profile"
                className="text-sm font-medium text-zinc-300 hover:text-white"
              >
                Edit profile
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => void signOutDemo()}
                className="text-sm font-medium text-zinc-300 hover:text-white disabled:opacity-50"
              >
                {busy ? "…" : "Sign out"}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="text-sm font-medium text-zinc-300 hover:text-white"
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
