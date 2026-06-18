"use client";

import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import { PaymentClient } from "./PaymentClient";
import { MobilePaymentClient } from "./MobilePaymentClient";

export default function PaymentSwitcher({
  showCanceled,
  planRequired,
  initialStripeSubscriptionsReady,
  initialPayPalSubscriptionsReady,
}: {
  showCanceled?: boolean;
  planRequired?: boolean;
  initialStripeSubscriptionsReady?: boolean;
  initialPayPalSubscriptionsReady?: boolean;
}) {
  const { isMobile, mounted } = useIsMobileApp();

  if (!mounted) {
    // Desktop layout loader placeholder before hydration
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-8 sm:px-6 sm:py-10">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-sm h-96 animate-pulse" />
      </div>
    );
  }

  return isMobile ? (
    <MobilePaymentClient
      showCanceled={showCanceled}
      planRequired={planRequired}
      initialStripeSubscriptionsReady={initialStripeSubscriptionsReady}
      initialPayPalSubscriptionsReady={initialPayPalSubscriptionsReady}
    />
  ) : (
    <PaymentClient
      showCanceled={showCanceled}
      planRequired={planRequired}
      initialStripeSubscriptionsReady={initialStripeSubscriptionsReady}
      initialPayPalSubscriptionsReady={initialPayPalSubscriptionsReady}
    />
  );
}
