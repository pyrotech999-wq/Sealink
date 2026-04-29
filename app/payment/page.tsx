import type { Metadata } from "next";
import { PaymentClient } from "./PaymentClient";

export const metadata: Metadata = {
  title: "Plans & payment",
  description: "SeaLink — 14-day trial, then monthly or yearly. Voucher codes validated on the server.",
};

export default function PaymentPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <PaymentClient />
    </div>
  );
}
