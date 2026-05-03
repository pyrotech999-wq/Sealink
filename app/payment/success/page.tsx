import type { Metadata } from "next";
import { Suspense } from "react";

import { PaymentSuccessClient } from "./PaymentSuccessClient";

export const metadata: Metadata = {
  title: "Subscription started",
  description: "Your SeaLink trial is active.",
};

type Props = { searchParams: Promise<{ provider?: string; subscription_id?: string }> };

export default async function PaymentSuccessPage({ searchParams }: Props) {
  const { provider, subscription_id: subId } = await searchParams;
  const paymentProvider = provider === "paypal" ? "paypal" : provider === "stripe" ? "stripe" : "other";

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col justify-center px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-green-200 bg-white p-8 text-center shadow-sm dark:border-green-900/40 dark:bg-zinc-950 sm:p-10">
        <p className="text-sm font-semibold text-green-800 dark:text-green-300">You&apos;re all set</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Trial subscription confirmed
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {paymentProvider === "paypal"
            ? "PayPal has recorded your subscription. You won’t be charged until the trial ends. You can manage billing from your PayPal account."
            : paymentProvider === "stripe"
              ? "Stripe has recorded your subscription. You won’t be charged until the trial ends. Use the links in Stripe’s confirmation email to manage your payment method or cancel."
              : "Your subscription is active. You won’t be charged until the trial ends."}
        </p>
        <Suspense
          fallback={
            <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
          }
        >
          <PaymentSuccessClient paymentProvider={paymentProvider} subscriptionIdFromServer={subId ?? null} />
        </Suspense>
      </div>
    </div>
  );
}
