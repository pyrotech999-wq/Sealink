import type { Metadata } from "next";
import { paymentEnvStatus } from "@/lib/payment-env-status";
import PaymentSwitcher from "./PaymentSwitcher";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plans & payment",
  description:
    "SeaLink — 14-day trial, then monthly or annual billing. Voucher codes validated on the server.",
};

type Props = { searchParams: Promise<{ canceled?: string; required?: string }> };

export default async function PaymentPage({ searchParams }: Props) {
  const { canceled, required } = await searchParams;
  const showCanceled = canceled === "1";
  const planRequired = required === "1";
  const envPay = paymentEnvStatus();

  return (
    <div className="flex flex-1 flex-col bg-black">
      <PaymentSwitcher
        showCanceled={showCanceled}
        planRequired={planRequired}
        initialStripeSubscriptionsReady={envPay.stripeSubscriptions}
        initialPayPalSubscriptionsReady={envPay.paypalSubscriptions}
      />
    </div>
  );
}

