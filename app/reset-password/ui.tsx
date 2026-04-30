"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export function ResetPasswordForm() {
  const sp = useSearchParams();
  const token = useMemo(() => sp.get("token") ?? "", [sp]);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setErr(null);
    if (!token) {
      setErr("Reset token missing. Use the link from your email.");
      return;
    }
    if (pw.length < 10) {
      setErr("Use at least 10 characters.");
      return;
    }
    if (pw !== pw2) {
      setErr("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const r = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) {
        setErr(d.error || "Could not reset password.");
        return;
      }
      setDone(true);
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Password updated</p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">You can now sign in with your new password.</p>
        <Link
          href="/sign-in"
          className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="rp-pw">
        New password
      </label>
      <input
        id="rp-pw"
        type="password"
        autoComplete="new-password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      <label className="mt-4 block text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="rp-pw2">
        Confirm new password
      </label>
      <input
        id="rp-pw2"
        type="password"
        autoComplete="new-password"
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 flex h-10 w-full items-center justify-center rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}

