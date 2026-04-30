"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BillingPlan } from "@/lib/pricing";
import { ANNUAL_GBP, discountedRecurringGbp, MONTHLY_GBP, recurringPriceGbp, TRIAL_DAYS } from "@/lib/pricing";

type Props = { showCanceled?: boolean };

export function PaymentClient({ showCanceled = false }: Props) {
  const [plan, setPlan] = useState<BillingPlan>("monthly");
  const [provider, setProvider] = useState<"stripe" | "paypal">("stripe");
  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState<{ code: string; discountPercent: number } | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const base = recurringPriceGbp(plan);
  const finalPrice = useMemo(
    () => (applied ? discountedRecurringGbp(plan, applied.discountPercent) : base),
    [plan, applied, base],
  );
  useEffect(() => {
    if (provider === "stripe") return;
    queueMicrotask(() => {
      setApplied(null);
      setVoucherError(null);
      setCodeInput("");
    });
  }, [provider]);

  async function applyVoucher() {
    setVoucherError(null);
    setVoucherLoading(true);
    try {
      const res = await fetch("/api/voucher/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput }),
      });
      const data = (await res.json()) as { valid?: boolean; discountPercent?: number; message?: string };
      if (!res.ok || !data.valid || typeof data.discountPercent !== "number") {
        setApplied(null);
        setVoucherError(data.message ?? "Code could not be applied");
        return;
      }
      setApplied({ code: codeInput.trim().toUpperCase(), discountPercent: data.discountPercent });
    } catch {
      setVoucherError("Could not reach server. Try again.");
      setApplied(null);
    } finally {
      setVoucherLoading(false);
    }
  }

  function clearVoucher() {
    setApplied(null);
    setVoucherError(null);
    setCodeInput("");
  }

  function onCodeChange(v: string) {
    setCodeInput(v);
    if (applied && v.trim().toUpperCase() !== applied.code) {
      setApplied(null);
      setVoucherError(null);
    }
  }

  async function startCheckout() {
    setCheckoutError(null);
    setCheckoutLoading(true);
    try {
      if (provider === "stripe") {
        const res = await fetch("/api/checkout/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan,
            ...(applied ? { voucherCode: applied.code } : {}),
          }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          setCheckoutError(data.error ?? "Checkout could not be started");
          return;
        }
        window.location.assign(data.url);
      } else {
        // PayPal subscriptions: voucher codes are currently Stripe-only.
        if (applied) {
          setCheckoutError("Voucher codes are currently available for Stripe checkout only.");
          return;
        }
        const res = await fetch("/api/paypal/subscription/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        const data = (await res.json()) as { approveUrl?: string; error?: string };
        if (!res.ok || !data.approveUrl) {
          setCheckoutError(data.error ?? "PayPal checkout could not be started");
          return;
        }
        window.location.assign(data.approveUrl);
      }
    } catch {
      setCheckoutError("Network error. Try again.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/" className="text-sm font-medium text-green-800 hover:underline dark:text-green-400">
        ← Home
      </Link>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        {showCanceled && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            Checkout was canceled. You can try again when you&apos;re ready.
          </p>
        )}
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900/50 dark:bg-green-950/30">
          <p className="text-sm font-semibold text-green-900 dark:text-green-100">{TRIAL_DAYS}-day free trial</p>
          <p className="mt-1 text-xs leading-5 text-green-800/90 dark:text-green-200/90">
            Try everything free for two weeks. After that, your plan renews at the rate below unless you cancel.
          </p>
        </div>

        <h1 className="mt-6 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Choose your plan</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Monthly or annual — two billing options, each with its own price. Checkout opens with your chosen provider.
        </p>
        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">Figures below are after your trial.</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setProvider("stripe")}
            className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${
              provider === "stripe"
                ? "border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-950/40"
                : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Stripe</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Card / Apple Pay / Google Pay</p>
            <p className="mt-1 text-[11px] text-zinc-500">Best for cards + receipts</p>
          </button>
          <button
            type="button"
            onClick={() => setProvider("paypal")}
            className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${
              provider === "paypal"
                ? "border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-950/40"
                : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">PayPal</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">PayPal balance / linked card</p>
            <p className="mt-1 text-[11px] text-zinc-500">Popular for fast sign-up</p>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPlan("monthly")}
            className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${
              plan === "monthly"
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
            className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${
              plan === "annual"
                ? "border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-950/40"
                : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Annual</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">£{ANNUAL_GBP}/yr</p>
            <p className="mt-0.5 text-[11px] text-green-800 dark:text-green-300">Save vs 12× monthly</p>
          </button>
        </div>

        <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Voucher code</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Discounts from <span className="font-medium text-zinc-700 dark:text-zinc-300">1%</span> up to{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">100%</span> — only codes you add on the server
            are accepted.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={codeInput}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder="e.g. LAUNCH100"
              disabled={provider !== "stripe"}
              className="min-h-10 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm uppercase text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="button"
              disabled={provider !== "stripe" || voucherLoading || !codeInput.trim()}
              onClick={applyVoucher}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {voucherLoading ? "Checking…" : "Apply"}
            </button>
          </div>
          {provider !== "stripe" ? (
            <p className="mt-2 text-xs text-zinc-500">Voucher codes are currently available for Stripe checkout only.</p>
          ) : null}
          {voucherError && <p className="mt-2 text-xs text-red-600">{voucherError}</p>}
          {applied && (
            <p className="mt-2 text-xs font-medium text-green-800 dark:text-green-300">
              Applied <span className="font-mono">{applied.code}</span> — {applied.discountPercent}% off your recurring
              price.
              <button type="button" onClick={clearVoucher} className="ml-2 underline">
                Remove
              </button>
            </p>
          )}
        </div>

        <div className="mt-8 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/60">
          <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
            <span>After trial ({plan === "monthly" ? "per month" : "per year, annual billing"})</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">£{base.toFixed(2)}</span>
          </div>
          {applied && applied.discountPercent > 0 && (
            <div className="mt-2 flex justify-between text-sm text-green-800 dark:text-green-300">
              <span>Voucher ({applied.discountPercent}%)</span>
              <span>−£{(base - finalPrice).toFixed(2)}</span>
            </div>
          )}
          <div className="mt-3 flex justify-between border-t border-zinc-200 pt-3 text-base font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
            <span>You pay</span>
            <span>£{finalPrice.toFixed(2)}</span>
          </div>
          {applied?.discountPercent === 100 && (
            <p className="mt-2 text-xs text-green-800 dark:text-green-300">100% off — £0 due each period after trial.</p>
          )}
        </div>

        {checkoutError && <p className="mt-4 text-center text-sm text-red-600">{checkoutError}</p>}
        <button
          type="button"
          disabled={checkoutLoading}
          onClick={() => void startCheckout()}
          className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {checkoutLoading ? "Redirecting…" : `Start ${TRIAL_DAYS}-day free trial`}
        </button>
        <p className="mt-3 text-center text-[11px] text-zinc-500">
          You will not be charged until the trial ends. Cancel anytime during the trial.
        </p>
      </div>
    </div>
  );
}
