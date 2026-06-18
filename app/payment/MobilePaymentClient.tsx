"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BillingPlan } from "@/lib/pricing";
import { ANNUAL_GBP, MONTHLY_GBP, recurringPriceGbp, TRIAL_DAYS } from "@/lib/pricing";
import { getMeSubscription } from "@/lib/client/me-subscription";
import { CreditCard, Shield, AlertTriangle, CheckCircle, Gift, Info, Lock, ArrowRight, Activity, Sparkles } from "lucide-react";

type Props = {
  showCanceled?: boolean;
  planRequired?: boolean;
  initialStripeSubscriptionsReady?: boolean;
  initialPayPalSubscriptionsReady?: boolean;
};

type BillingProvider = "stripe" | "paypal";

// Custom inline Paypal SVG to avoid Lucide Paypal member error
function PaypalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.07 6.78c-.28 1.48-1.04 3.01-2.22 4.19-1.28 1.28-3.05 2.03-5 2.03H9.41L7.83 23h4.34c.55 0 1.03-.38 1.15-.92l1.63-8.38c.12-.54.6-.92 1.15-.92h1.16c3.23 0 5.48-1.6 6.07-4.63.29-1.48.07-2.82-.67-3.83-.53-.73-1.42-1.24-2.61-1.54z" />
      <path d="M16.63 1.34C16.03.35 14.86 0 13.34 0H6.46c-.55 0-1.03.38-1.15.92L1 21.46c-.08.41.23.79.65.79h4.63l1.58-9.98c.12-.54.6-.92 1.15-.92h2.95c3.23 0 5.48-1.6 6.07-4.63.31-1.6.09-3.04-.71-4.13-.53-.73-1.42-1.24-2.61-1.54z" />
    </svg>
  );
}

export function MobilePaymentClient({
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
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#030816] via-[#09152a] to-[#020510] text-white p-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* Top Header Navigation */}
      <div className="shrink-0 flex items-center justify-between pt-[calc(env(safe-area-inset-top)+1rem)] pb-3">
        {access === null ? (
          planRequired ? (
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest animate-pulse">Verifying Console Access...</span>
          ) : (
            <Link href="/" className="text-xs font-bold text-slate-400 bg-white/[0.05] border border-white/[0.08] px-3.5 py-1.5 rounded-full hover:bg-white/[0.1] active:scale-95 transition-all">
              ← Back to Map
            </Link>
          )
        ) : access.hasAccess ? (
          <Link href="/" className="text-xs font-bold text-slate-400 bg-white/[0.05] border border-white/[0.08] px-3.5 py-1.5 rounded-full hover:bg-white/[0.1] active:scale-95 transition-all">
            ← Back to Map
          </Link>
        ) : planRequired ? (
          <span className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest">Premium Setup</span>
        ) : (
          <Link href="/" className="text-xs font-bold text-slate-400 bg-white/[0.05] border border-white/[0.08] px-3.5 py-1.5 rounded-full hover:bg-white/[0.1] active:scale-95 transition-all">
            ← Back to Map
          </Link>
        )}
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-ping" />
          <span className="text-[10px] font-bold tracking-widest uppercase text-cyan-400">Yacht Link v1</span>
        </div>
      </div>

      {/* Brand Header */}
      <div className="text-center py-4 shrink-0">
        <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 shadow-[0_0_15px_rgba(6,182,212,0.3)] mb-3">
          <Activity className="size-6 text-white" />
        </div>
        <h1 className="text-xl font-extrabold tracking-tight text-white">Upgrade to Premium</h1>
        <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
          Access the ultimate yacht navigation and monitoring toolkit. Unlock full live systems.
        </p>
      </div>

      {/* Main glass details board */}
      <main className="flex-1 flex flex-col justify-center py-2 space-y-4">
        {/* Value Prop Cards Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/[0.02] border border-white/[0.05] p-3 rounded-2xl">
            <span className="text-cyan-400 text-lg">🗺️</span>
            <h4 className="text-xs font-bold text-white mt-1">HD Navigation</h4>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Full interactive marine charts and vessel sharing.</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.05] p-3 rounded-2xl">
            <span className="text-amber-400 text-lg">⚓</span>
            <h4 className="text-xs font-bold text-white mt-1">Smart Anchor</h4>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Background GPS alarms to watch for drift hazards.</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.05] p-3 rounded-2xl">
            <span className="text-sky-400 text-lg">⚡</span>
            <h4 className="text-xs font-bold text-white mt-1">Live Weather</h4>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">OPC surface pressure grids, wave heights, and tide loops.</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.05] p-3 rounded-2xl">
            <span className="text-purple-400 text-lg">📡</span>
            <h4 className="text-xs font-bold text-white mt-1">Crew Broadcasts</h4>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Broadcast map markers and chat with nearby boats.</p>
          </div>
        </div>

        <div className="w-full bg-gradient-to-br from-[#0c1a30]/85 to-[#061020]/95 border border-white/[0.08] p-5 rounded-[28px] shadow-2xl space-y-4">

          {/* Notifications / Alerts strip */}
          {planRequired && access !== null && !access.hasAccess && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-2.5 shadow-inner">
              <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Access Restrained</p>
                <p className="text-[10px] leading-relaxed text-slate-300 mt-1">
                  A active subscription (or trial) is required to unlock full maps, live forecasts, and background alarms.
                </p>
              </div>
            </div>
          )}

          {isAdmin && paypalEnv != null && paypalConfigured && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-2.5 shadow-inner">
              <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">PayPal Test Mode</p>
                <p className="text-[10px] leading-relaxed text-slate-300 mt-1">
                  PayPal billing environment is configured to sandbox testing mode.
                </p>
              </div>
            </div>
          )}

          {access?.hasAccess && (
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 flex gap-2.5 shadow-inner">
              <CheckCircle size={18} className="text-sky-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-sky-400 uppercase tracking-widest">Premium Active</p>
                <p className="text-[10px] leading-relaxed text-slate-300 mt-1">
                  You already have full yacht console access
                  {access.source === "paypal"
                    ? " via your PayPal subscription."
                    : access.source === "stripe"
                      ? " via your Stripe subscription."
                      : " via complimentary admin access."}
                </p>
              </div>
            </div>
          )}

          {/* Trial highlight details */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-inner flex gap-3">
            <Gift size={20} className="text-emerald-400 shrink-0 mt-0.5 animate-bounce" />
            <div>
              <p className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={13} className="text-cyan-400 animate-pulse" />
                {TRIAL_DAYS}-Day Free Trial Included
              </p>
              <p className="mt-1 text-[10.5px] leading-normal text-slate-300">
                Test all premium deck instrumentation free for {TRIAL_DAYS} days. Cancel anytime before renewal to avoid charges.
              </p>
            </div>
          </div>

          {stripeSubscriptionsReady === false && paypalSubscriptionsReady === false && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center text-xs text-amber-400">
              Billing gateways are not configured on this host server.
            </div>
          )}

          {/* Billing Cycle Interval Toggles */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Select Interval</span>
            <div className="grid grid-cols-2 gap-2 bg-black/30 p-1.5 rounded-2xl border border-white/[0.04]">
              <button
                type="button"
                onClick={() => setPlan("monthly")}
                className={`relative py-3.5 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${plan === "monthly"
                  ? "bg-[#112440] text-cyan-400 border border-cyan-500/20 shadow-lg"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
                  }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider">Monthly</span>
                <span className="font-extrabold text-sm">£{MONTHLY_GBP}<span className="text-[10px] font-medium text-slate-400">/mo</span></span>
              </button>
              <button
                type="button"
                onClick={() => setPlan("annual")}
                className={`relative py-3.5 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${plan === "annual"
                  ? "bg-[#112440] text-cyan-400 border border-cyan-500/20 shadow-lg"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
                  }`}
              >
                <span className="absolute -top-2.5 -right-1.5 rounded-full bg-cyan-500 text-black font-black text-[8px] px-2 py-0.5 tracking-wider uppercase shadow-[0_0_8px_rgba(6,182,212,0.5)]">
                  Save 17%
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider">Annual</span>
                <span className="font-extrabold text-sm">£{ANNUAL_GBP}<span className="text-[10px] font-medium text-slate-400">/yr</span></span>
              </button>
            </div>
          </div>

          {/* Provider Selector buttons */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Payment Method</span>
            <div className="grid grid-cols-2 gap-2 bg-black/30 p-1.5 rounded-2xl border border-white/[0.04]">
              <button
                type="button"
                disabled={!stripeSubscriptionsReady}
                onClick={() => setBillingProvider("stripe")}
                className={`flex items-center justify-center gap-2 py-3 px-2 rounded-xl text-xs font-bold transition-all ${billingProvider === "stripe"
                  ? "bg-[#112440] text-cyan-400 border border-cyan-500/20 shadow-lg"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <CreditCard size={15} />
                Credit Card
              </button>
              <button
                type="button"
                disabled={!paypalSubscriptionsReady}
                onClick={() => setBillingProvider("paypal")}
                className={`flex items-center justify-center gap-2 py-3 px-2 rounded-xl text-xs font-bold transition-all ${billingProvider === "paypal"
                  ? "bg-[#112440] text-cyan-400 border border-cyan-500/20 shadow-lg"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <PaypalIcon className="size-4 shrink-0" />
                PayPal
              </button>
            </div>
          </div>

          {/* Receipt billing table */}
          <div className="relative rounded-2xl bg-black/45 border border-white/[0.04] p-4 text-xs font-mono space-y-2.5 overflow-hidden">
            {/* Ticket decorative notch left and right */}
            <div className="absolute top-1/2 -left-2.5 size-4 rounded-full bg-[#071b36] border border-white/[0.08]" />
            <div className="absolute top-1/2 -right-2.5 size-4 rounded-full bg-[#071b36] border border-white/[0.08]" />

            <div className="text-center pb-2 border-b border-dashed border-white/[0.1] text-zinc-500 text-[10px] tracking-widest uppercase font-bold">
              Billing Voucher
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Recurrence Rate</span>
              <span>£{base.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Trial period ({TRIAL_DAYS} days)</span>
              <span className="text-emerald-400">-£{base.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-dashed border-white/[0.1] pt-3 text-sm font-extrabold text-white">
              <span>Total Due Today</span>
              <div className="text-right">
                <span className="text-cyan-400 font-black text-sm">£0.00</span>
                <p className="text-[9px] text-slate-400 font-sans font-normal tracking-normal mt-0.5">Trial ends in {TRIAL_DAYS} days</p>
              </div>
            </div>
          </div>

          {checkoutError && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-xs text-red-400">
              {checkoutError}
            </p>
          )}

          {/* Action trigger button */}
          <button
            type="button"
            disabled={
              checkoutLoading ||
              access?.hasAccess === true ||
              (billingProvider === "stripe" && !stripeSubscriptionsReady) ||
              (billingProvider === "paypal" && !paypalSubscriptionsReady)
            }
            onClick={() => void startCheckout()}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:brightness-110 active:scale-[0.98] text-xs font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_15px_rgba(37,99,235,0.3)]"
          >
            <Lock size={13} className="text-white/85" />
            {checkoutLoading
              ? "Establishing secure connection..."
              : access?.hasAccess
                ? "Tactical Console Active"
                : `Activate Trial with ${billingProvider === "stripe" ? "Stripe" : "PayPal"}`}
            <ArrowRight size={13} className="text-white/85" />
          </button>

          <p className="text-center text-[9px] text-slate-500 font-sans tracking-wide leading-relaxed">
            SSL encrypted connection. Cancel anytime with no commitment in account settings.
          </p>

        </div>
      </main>
    </div>
  );
}
