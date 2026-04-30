"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordForm() {
  const sp = useSearchParams();
  const initial = useMemo(() => sp.get("email") ?? "", [sp]);
  const [email, setEmail] = useState(initial);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function submit() {
    const trimmed = email.trim();
    setErr(null);
    setDevLink(null);
    if (!EMAIL_RE.test(trimmed)) {
      setErr("Enter a valid email address.");
      return;
    }
    setPending(true);
    try {
      const r = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const d = (await r.json()) as { ok?: boolean; devLink?: string };
      if (typeof d.devLink === "string") setDevLink(d.devLink);
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
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Check your email</p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          If an account exists for that address, we’ve sent a password reset link. It expires after 30 minutes.
        </p>
        {devLink ? (
          <p className="mt-3 break-all rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
            Dev link (SMTP not configured): {devLink}
          </p>
        ) : null}
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
      <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="fp-email">
        Email address
      </label>
      <input
        id="fp-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 flex h-10 w-full items-center justify-center rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

