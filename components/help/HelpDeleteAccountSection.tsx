"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

export function HelpDeleteAccountSection() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/demo/me", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json() as Promise<{ signedIn?: boolean }>)
      .then((d) => {
        if (!cancelled) setSignedIn(d.signedIn === true);
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onDelete = useCallback(async () => {
    setMessage(null);
    const ok = window.confirm(
      "Delete your SeaLink account permanently? Your profile, devices, listings you posted, and subscription records tied to this account will be removed. This cannot be undone.",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch("/api/auth/delete-data", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ confirm: "DELETE_MY_ACCOUNT" }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) {
        setMessage(d.error || "Could not delete account. Try again or use Help → Email developers.");
        return;
      }
      window.location.assign("/");
    } catch {
      setMessage("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">How to delete your account</h2>
        <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
          You can read this page without signing in. To actually remove your account, SeaLink must know it is you — so the
          last steps require an active session in this browser.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          <li>
            <strong className="text-zinc-900 dark:text-zinc-100">Sign in</strong> with the email and password (or Google /
            Apple / Facebook, if you use those) for the account you want to close.{" "}
            <Link href="/sign-in" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Open sign in
            </Link>
            .
          </li>
          <li>
            <strong className="text-zinc-900 dark:text-zinc-100">Come back to this page</strong> in the{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">same browser</strong> (bookmark{" "}
            <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">/delete-data</span> or use your
            history). If you do not see the red button below, refresh once after signing in.
          </li>
          <li>
            <strong className="text-zinc-900 dark:text-zinc-100">Read the summary</strong> in{" "}
            <Link href="/help#delete-data" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Help → Delete your data
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              privacy policy
            </Link>{" "}
            if you want detail on what we remove.
          </li>
          <li>
            <strong className="text-zinc-900 dark:text-zinc-100">Delete</strong> using the button below, then confirm in
            the dialog. You will be signed out and returned to the home page.
          </li>
        </ol>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          No paid plan is required to use this page — only a valid sign-in. If you cannot access your account, use{" "}
          <Link href="/forgot-password" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Forgotten password
          </Link>{" "}
          or email the developers from{" "}
          <Link href="/help" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Help
          </Link>
          .
        </p>
      </div>

      <div className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-4 py-4 text-sm text-zinc-400 dark:bg-zinc-900/40">
        <p className="font-medium text-zinc-200">Remove account now</p>
        {signedIn === null ? (
          <p className="mt-2 text-xs text-zinc-500">Checking whether you are signed in in this browser…</p>
        ) : null}
        {signedIn === false ? (
          <p className="mt-2 text-xs leading-5 text-zinc-400">
            You are <strong className="text-zinc-300">not</strong> signed in here yet. Follow step 1 above, then reload
            this page — the delete button will appear when your session is active.
          </p>
        ) : null}
        {signedIn === true ? (
          <>
            <p className="mt-2 text-xs leading-5 text-zinc-400">
              Your session is active. This only affects the SeaLink account linked to this browser — not your Google /
              Apple / Facebook account with those companies.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDelete()}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg border border-red-900/60 bg-red-950/50 px-4 text-sm font-medium text-red-200 hover:bg-red-950/80 disabled:opacity-50 sm:w-auto"
            >
              {busy ? "Deleting…" : "Delete my account permanently"}
            </button>
          </>
        ) : null}
        {message ? <p className="mt-3 text-xs text-red-300">{message}</p> : null}
      </div>
    </div>
  );
}
