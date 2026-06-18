"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BillingPlan } from "@/lib/pricing";
import { ANNUAL_GBP, MONTHLY_GBP, recurringPriceGbp, TRIAL_DAYS } from "@/lib/pricing";
import { getMeSubscription } from "@/lib/client/me-subscription";

type Props = {
  showCanceled?: boolean;
  planRequired?: boolean;
  /** From server env so production shows correct toggles even if /api fetch fails (CSP, adblock, etc.). */
  initialStripeSubscriptionsReady?: boolean;
  initialPayPalSubscriptionsReady?: boolean;
};

type BillingProvider = "stripe" | "paypal";

export function PaymentClient({
  showCanceled = false,
  planRequired = false,
  initialStripeSubscriptionsReady = false,
  initialPayPalSubscriptionsReady = false,
}: Props) {
  const [plan, setPlan] = useState<BillingPlan>("monthly");
  const [billingProvider, setBillingProvider] = useState<BillingProvider>("stripe");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paypalEnv, setPaypalEnv] = useState<"live" | "sandbox" | null>(null);
  const [paypalConfigured, setPaypalConfigured] = useState<boolean | null>(null);
  const [paypalSubscriptionsReady, setPaypalSubscriptionsReady] = useState<boolean | null>(
    initialPayPalSubscriptionsReady,
  );
  const [stripeSubscriptionsReady, setStripeSubscriptionsReady] = useState<boolean | null>(
    initialStripeSubscriptionsReady,
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [access, setAccess] = useState<{
    hasAccess: boolean;
    source: "reserved" | "admin_grant" | "paypal" | "stripe" | "none";
  } | null>(null);

  useEffect(() => {
    void getMeSubscription()
      .then((d) => {
        if (!d || typeof d.hasAccess !== "boolean") {
          setAccess(null);
          setIsAdmin(false);
          return;
        }
        const src =
          d.source === "paypal" || d.source === "stripe" || d.source === "admin_grant" || d.source === "reserved"
            ? d.source
            : "none";
        setAccess({ hasAccess: d.hasAccess, source: src });
        setIsAdmin(Boolean(d.isAdmin));
      })
      .catch(() => {
        setAccess(null);
        setIsAdmin(false);
      });
  }, []);

  useEffect(() => {
    void fetch("/api/stripe/config", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ subscriptions?: boolean }>)
      .then((d) => setStripeSubscriptionsReady(Boolean(d.subscriptions)))
      .catch(() => {
        /* keep server-provided initialStripeSubscriptionsReady */
      });
  }, []);

  useEffect(() => {
    void fetch("/api/paypal/mode", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ env?: string; configured?: boolean; subscriptionsReady?: boolean }>)
      .then((d) => {
        if (isAdmin) {
          setPaypalEnv(d.env === "live" ? "live" : "sandbox");
          setPaypalConfigured(Boolean(d.configured));
        } else {
          setPaypalEnv(null);
          setPaypalConfigured(null);
        }
        setPaypalSubscriptionsReady(Boolean(d.subscriptionsReady));
      })
      .catch(() => {
        setPaypalEnv(null);
        setPaypalConfigured(null);
        /* keep server-provided initialPayPalSubscriptionsReady */
      });
  }, [isAdmin]);

  const base = recurringPriceGbp(plan);
  const finalPrice = useMemo(() => base, [base]);

  useEffect(() => {
    if (stripeSubscriptionsReady === null || paypalSubscriptionsReady === null) return;
    if (stripeSubscriptionsReady && paypalSubscriptionsReady) {
      setBillingProvider("stripe");
      return;
    }
    if (stripeSubscriptionsReady) {
      setBillingProvider("stripe");
      return;
    }
    if (paypalSubscriptionsReady) setBillingProvider("paypal");
  }, [stripeSubscriptionsReady, paypalSubscriptionsReady]);

  async function startCheckout() {
    setCheckoutError(null);
    setCheckoutLoading(true);
    try {
      if (billingProvider === "stripe") {
        const res = await fetch("/api/stripe/subscription/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ plan }),
        });
        const data = (await res.json()) as { url?: string; error?: string; detail?: string };
        if (res.status === 401) {
          setCheckoutError("Sign in to pay with card (Stripe). PayPal checkout can be used without signing in first.");
          return;
        }
        if (!res.ok || !data.url) {
          const detail = typeof data.detail === "string" && data.detail.trim() ? ` ${data.detail.trim().slice(0, 200)}` : "";
          setCheckoutError(`${data.error ?? "Stripe checkout could not be started"}${detail}`);
          return;
        }
        window.location.assign(data.url);
        return;
      }

      const res = await fetch("/api/paypal/subscription/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { approveUrl?: string; subscriptionId?: string | null; error?: string };
      if (!res.ok || !data.approveUrl) {
        setCheckoutError(data.error ?? "PayPal checkout could not be started");
        return;
      }
      try {
        const sid = typeof data.subscriptionId === "string" ? data.subscriptionId.trim() : "";
        if (sid) sessionStorage.setItem("sealink_paypal_subscription_pending", sid);
      } catch {
        /* private mode etc. */
      }
      window.location.assign(data.approveUrl);
    } catch {
      setCheckoutError("Network error. Try again.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 sm:px-6 sm:py-10">
      {access === null ? (
        planRequired ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Checking your account…</p>
        ) : (
          <Link href="/" className="text-sm font-medium text-green-800 hover:underline dark:text-green-400">
            ← Home
          </Link>
        )
      ) : access.hasAccess ? (
        <Link href="/" className="text-sm font-medium text-green-800 hover:underline dark:text-green-400">
          ← Home
        </Link>
      ) : planRequired ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Choose a plan below to continue.</p>
      ) : (
        <Link href="/" className="text-sm font-medium text-green-800 hover:underline dark:text-green-400">
          ← Home
        </Link>
      )}

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        {planRequired && access !== null && !access.hasAccess ? (
          <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
            A subscription (or your {TRIAL_DAYS}-day trial after you complete checkout) is required to use the app.
            {isAdmin ? (
              <> The only exception is complimentary access granted by an admin for your account.</>
            ) : null}
          </p>
        ) : null}
        {isAdmin && paypalEnv != null && paypalConfigured ? (
          <p
            className={`mb-4 rounded-lg border px-3 py-2 text-xs font-medium ${paypalEnv === "live"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
              }`}
          >
            PayPal is in <span className="font-semibold">{paypalEnv === "live" ? "live" : "sandbox"}</span> mode
            {paypalEnv === "sandbox"
              ? " (test only — set PAYPAL_ENV=live and live keys on your host for real charges)."
              : " (real charges after trial)."}
          </p>
        ) : null}
        {access?.hasAccess ? (
          <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100">
            You already have full access
            {access.source === "paypal"
              ? " via your PayPal subscription."
              : access.source === "stripe"
                ? " via your Stripe subscription."
                : isAdmin
                  ? " (complimentary — reserved owner or admin grant)."
                  : "."}{" "}
            You don&apos;t need to subscribe again unless you change accounts.
          </p>
        ) : null}
        {showCanceled && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            Checkout was canceled. You can try again when you&apos;re ready.
          </p>
        )}
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900/50 dark:bg-green-950/30">
          <p className="text-sm font-semibold text-green-900 dark:text-green-100">{TRIAL_DAYS}-day free trial</p>
          <p className="mt-1 text-xs leading-5 text-green-800/90 dark:text-green-200/90">
            Try everything free for {TRIAL_DAYS === 7 ? "one week" : `${TRIAL_DAYS} days`}. After that, your plan renews at the rate below unless you cancel.
          </p>
        </div>

        <h1 className="mt-6 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Choose your plan</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Monthly or annual — two billing options, each with its own price. Pay with card (Stripe) or PayPal.
        </p>
        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">Figures below are after your trial.</p>
        {stripeSubscriptionsReady === false && paypalSubscriptionsReady === false ? (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
            Subscription checkout is not configured on this deployment (Stripe and PayPal subscription env vars are
            missing or incomplete). If it works on your laptop but not here, open your host (e.g. Vercel → Settings →
            Environment Variables) and add the same keys for the Production environment,
            then redeploy. Preview-only variables do not apply to the live domain.
          </p>
        ) : null}
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Pay with</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!stripeSubscriptionsReady}
              onClick={() => setBillingProvider("stripe")}
              className={`rounded-xl border-2 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${billingProvider === "stripe"
                ? "border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-950/40"
                : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50"
                }`}
            >
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Card (Stripe)</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">Visa, Mastercard, etc. — sign in required</p>
            </button>
            <button
              type="button"
              disabled={!paypalSubscriptionsReady}
              onClick={() => setBillingProvider("paypal")}
              className={`rounded-xl border-2 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${billingProvider === "paypal"
                ? "border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-950/40"
                : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50"
                }`}
            >
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">PayPal</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">PayPal balance or linked card</p>
            </button>
          </div>
          {paypalSubscriptionsReady && !stripeSubscriptionsReady ? (
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Card (Stripe) is off until this deployment has{" "}
              <span className="font-mono text-zinc-600 dark:text-zinc-300">STRIPE_SECRET_KEY</span>,{" "}
              <span className="font-mono text-zinc-600 dark:text-zinc-300">STRIPE_PRICE_MONTHLY</span>, and{" "}
              <span className="font-mono text-zinc-600 dark:text-zinc-300">STRIPE_PRICE_ANNUAL</span> in production
              env, then a redeploy. If you still only see PayPal, push the latest code — older builds had PayPal only.
            </p>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPlan("monthly")}
            className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${plan === "monthly"
              ? "border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-950/40"
              : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50"
              }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Monthly</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">£{MONTHLY_GBP}/mo</p>
          </button>
          <button
            type="button"
            onClick={() => setPlan("annual")}
            className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${plan === "annual"
              ? "border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-950/40"
              : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50"
              }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Annual</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">£{ANNUAL_GBP}/yr</p>
            <p className="mt-0.5 text-[11px] text-green-800 dark:text-green-300">Save vs 12× monthly</p>
          </button>
        </div>

        <div className="mt-8 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/60">
          <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
            <span>After trial ({plan === "monthly" ? "per month" : "per year, annual billing"})</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">£{base.toFixed(2)}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-zinc-200 pt-3 text-base font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
            <span>You pay</span>
            <span>£{finalPrice.toFixed(2)}</span>
          </div>
        </div>

        {checkoutError && <p className="mt-4 text-center text-sm text-red-600">{checkoutError}</p>}
        <button
          type="button"
          disabled={
            checkoutLoading ||
            access?.hasAccess === true ||
            (billingProvider === "stripe" && !stripeSubscriptionsReady) ||
            (billingProvider === "paypal" && !paypalSubscriptionsReady)
          }
          onClick={() => void startCheckout()}
          className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {checkoutLoading
            ? "Redirecting…"
            : access?.hasAccess
              ? "Already subscribed"
              : `Continue to ${billingProvider === "stripe" ? "Stripe" : "PayPal"}`}
        </button>
        <p className="mt-3 text-center text-[11px] text-zinc-500">
          You will not be charged until the trial ends. Cancel anytime during the trial.
        </p>
      </div>
    </div>
  );
}
