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
      const r = await fetch("/api/auth/delete-account", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ confirm: "DELETE_MY_ACCOUNT" }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) {
        setMessage(d.error || "Could not delete account. Try again or email developers from Help below.");
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
    <div className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-3 text-xs text-zinc-400">
      <p className="font-medium text-zinc-300">Delete account from this device</p>
      <p className="mt-2 leading-5">
        If you are signed in, you can remove your account here. You will be signed out and returned to the home page. For
        what we keep and why, see the{" "}
        <Link href="/privacy" className="font-medium text-emerald-400 hover:underline">
          privacy policy
        </Link>
        .
      </p>
      {signedIn === false ? (
        <p className="mt-2 text-zinc-500">
          You are not signed in —{" "}
          <Link href="/sign-in" className="font-medium text-emerald-400 hover:underline">
            sign in
          </Link>{" "}
          first, then open Help again to delete your account.
        </p>
      ) : null}
      {signedIn === true ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDelete()}
          className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-red-900/60 bg-red-950/50 px-4 text-sm font-medium text-red-200 hover:bg-red-950/80 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete my account permanently"}
        </button>
      ) : null}
      {signedIn === null ? <p className="mt-2 text-zinc-500">Checking sign-in…</p> : null}
      {message ? <p className="mt-2 text-red-300">{message}</p> : null}
    </div>
  );
}
