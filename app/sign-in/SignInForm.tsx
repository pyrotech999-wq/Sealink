"use client";

import Link from "next/link";
import { useState } from "react";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter email and password");
      return;
    }
    if (!agree) {
      setError("Confirm you agree to the policies before signing in");
      return;
    }
    setError("");
    console.info("sign-in", { email });
  }

  return (
    <form
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
        className="mt-6 flex h-10 w-full items-center justify-center rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700"
      >
        Sign in
      </button>
    </form>
  );
}
