"use client";

import Link from "next/link";
import { useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function startDemoSession(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch("/api/demo/sign-in", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      return { ok: false, message: data.error || "Could not start session. Try again." };
    }
  } catch {
    return { ok: false, message: "Network error. Try again." };
  }
  window.location.assign("/");
  return { ok: true };
}

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("Enter email and password");
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email address (or use “Skip sign-in” below).");
      return;
    }
    if (!agree) {
      setError("Tick the box to confirm you agree to the terms and privacy policy — or use “Skip sign-in”.");
      return;
    }
    setError("");
    setPending(true);
    const result = await startDemoSession(trimmed);
    if (!result.ok) {
      setError(result.message);
      setPending(false);
    }
  }

  async function skipSignIn() {
    setError("Sign-in is required to post or manage adverts and broadcasts.");
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}
      <div className="space-y-4">
        <div>
          <label htmlFor="signin-email" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Email address
          </label>
          <input
            id="signin-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="signin-password" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Password
            </label>
            <button
              type="button"
              className="text-xs font-medium text-green-800 hover:underline dark:text-green-400"
              onClick={() => alert("Wire this to your password reset flow.")}
            >
              Forgotten password?
            </button>
          </div>
          <input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-1 size-4 rounded border-zinc-300 text-green-700 focus:ring-green-600"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            I agree to the{" "}
            <Link href="/terms" className="font-medium text-green-800 underline-offset-2 hover:underline dark:text-green-400">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-green-800 underline-offset-2 hover:underline dark:text-green-400">
              privacy policy
            </Link>
            .
          </span>
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-6 flex h-10 w-full items-center justify-center rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {pending ? "Opening app…" : "Sign in"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => void skipSignIn()}
        className="mt-3 flex h-10 w-full items-center justify-center rounded-lg border border-zinc-300 bg-white text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Skip sign-in — try the app (demo)
      </button>
      <p className="mt-4 text-center text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        You can also use the <strong className="text-zinc-700 dark:text-zinc-300">Home</strong> tab in the bottom bar —
        nothing in this build requires a real account.
      </p>
    </form>
  );
}
