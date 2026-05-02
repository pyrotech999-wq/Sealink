import type { Metadata } from "next";
import { PaymentClient } from "./PaymentClient";

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

  return (
    <div className="flex flex-1 flex-col bg-black">
      <PaymentClient showCanceled={showCanceled} planRequired={planRequired} />
    </div>
  );
}
