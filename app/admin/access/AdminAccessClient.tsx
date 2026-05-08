"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  uid: string;
  email: string;
  createdAt: string;
  paypalStatus: string | null;
  freeAccessGranted: boolean;
  hasAccess: boolean;
};

export function AdminAccessClient() {
  const [users, setUsers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch("/api/admin/subscription-users", { credentials: "same-origin" });
      const d = (await r.json()) as { ok?: boolean; users?: Row[]; error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Could not load users");
        setUsers([]);
        return;
      }
      setUsers(Array.isArray(d.users) ? d.users : []);
    } catch {
      setErr("Network error");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function setGrant(uid: string, granted: boolean) {
    setBusyUid(uid);
    setErr(null);
    setSuccessNotice(null);
    try {
      const r = await fetch("/api/admin/grant-free-access", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, granted }),
      });
      const d = (await r.json()) as { error?: string; paypalCancelled?: boolean };
      if (!r.ok) {
        setErr(d.error ?? "Update failed");
        return;
      }
      if (granted && d.paypalCancelled) {
        setSuccessNotice(
          "Complimentary access enabled. Their active PayPal subscription was cancelled so they are not charged while on complimentary access.",
        );
        setTimeout(() => setSuccessNotice(null), 10000);
      }
      await load();
    } catch {
      setErr("Network error");
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Home
        </Link>
        <Link href="/admin/vessel-adverts" className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400">
          Boat adverts & promo codes
        </Link>
        <Link href="/admin/site-banners" className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-400">
          Site banner ads
        </Link>
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Subscription access</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        Only you (site admin) see this page. Grant or revoke <span className="font-semibold">complimentary full access</span>{" "}
        for any user without PayPal. The built-in reserved owner (primary admin email and matching UK profile phone) always
        has access without toggling here. Users keep normal sign-in; this only waives the subscription check for in-app benefits.
      </p>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        For production card payments, set <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">PAYPAL_ENV=live</code> and
        live REST credentials in your host env (see <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">.env.example</code>
        ).
      </p>

      {err ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      ) : null}
      {successNotice ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
          {successNotice}
        </p>
      ) : null}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">PayPal status</th>
              <th className="px-3 py-2">Access</th>
              <th className="px-3 py-2">Free access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {users.map((u) => (
              <tr key={u.uid} className="text-zinc-800 dark:text-zinc-200">
                <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                <td className="px-3 py-2 text-xs">{u.paypalStatus ?? "—"}</td>
                <td className="px-3 py-2">{u.hasAccess ? <span className="text-emerald-700 dark:text-emerald-400">Yes</span> : "No"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs">{u.freeAccessGranted ? "On" : "Off"}</span>
                    <button
                      type="button"
                      disabled={busyUid === u.uid}
                      onClick={() => void setGrant(u.uid, !u.freeAccessGranted)}
                      className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                    >
                      {busyUid === u.uid ? "…" : u.freeAccessGranted ? "Revoke" : "Grant"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && users.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-zinc-500">No user accounts found.</p>
        ) : null}
      </div>
    </div>
  );
}
