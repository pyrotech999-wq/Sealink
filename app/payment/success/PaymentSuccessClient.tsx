"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { setPendingAutoShareOnMapAfterPayment } from "@/lib/map-profile-storage";

const STORAGE_KEY = "sealink_paypal_subscription_pending";

type Phase = "idle" | "syncing" | "ready";

function readPendingSubscriptionId(sp: ReturnType<typeof useSearchParams>): string {
  const fromQuery =
    sp.get("subscription_id")?.trim() ||
    sp.get("subscriptionId")?.trim() ||
    sp.get("token")?.trim() ||
    "";
  if (fromQuery) return fromQuery;
  try {
    return sessionStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function PaymentSuccessClient({
  isPayPal,
  subscriptionIdFromServer,
}: {
  isPayPal: boolean;
  subscriptionIdFromServer: string | null;
}) {
  const sp = useSearchParams();
  /** PayPal: assume work until we confirm there is nothing to sync or verify finishes. */
  const [phase, setPhase] = useState<Phase>(() => (isPayPal ? "syncing" : "ready"));
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isPayPal) {
      setPhase("ready");
      setPendingAutoShareOnMapAfterPayment();
      return;
    }

    const subId = readPendingSubscriptionId(sp);
    if (!subId) {
      setPhase("ready");
      return;
    }

    let cancelled = false;
    setPhase("syncing");
    void (async () => {
      try {
        const r = await fetch("/api/paypal/subscription/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ subscriptionId: subId }),
        });
        const j = (await r.json()) as { ok?: boolean; error?: string; detail?: string };
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* */
        }
        if (cancelled) return;
        if (!r.ok || !j.ok) {
          const detail = typeof j.detail === "string" && j.detail.trim() ? ` ${j.detail.trim().slice(0, 200)}` : "";
          setErrMsg(`${j.error ?? "Could not confirm subscription"}.${detail}`);
          setPhase("ready");
          return;
        }
        setPendingAutoShareOnMapAfterPayment();
        setPhase("ready");
      } catch {
        if (cancelled) return;
        setErrMsg("Network error while confirming subscription.");
        setPhase("ready");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPayPal, sp]);

  const displayId = subscriptionIdFromServer?.trim() || readPendingSubscriptionId(sp) || null;

  return (
    <>
      {displayId ? (
        <p className="mt-2 break-all font-mono text-[11px] text-zinc-400 dark:text-zinc-500">PayPal subscription {displayId}</p>
      ) : null}
      {isPayPal && phase === "syncing" ? (
        <p className="mt-4 text-sm font-medium text-amber-800 dark:text-amber-200">
          Linking your PayPal subscription to this account…
        </p>
      ) : null}
      {errMsg ? (
        <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-left text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
          {errMsg}{" "}
          <span className="mt-2 block text-xs text-red-800/90 dark:text-red-200/90">
            You can try the payment page again. If money left your account, keep this screen and contact support with
            your PayPal receipt.
          </span>
        </p>
      ) : null}
      {phase === "ready" ? (
        <Link
          href="/"
          className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-6 text-sm font-medium text-white hover:bg-green-700"
        >
          Back to app
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className="mt-8 inline-flex h-11 cursor-not-allowed items-center justify-center rounded-lg bg-zinc-400 px-6 text-sm font-medium text-white opacity-90 dark:bg-zinc-600"
        >
          Linking subscription…
        </button>
      )}
    </>
  );
}
