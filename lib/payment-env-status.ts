import { stripeSubscriptionsConfigured, stripeVesselListingConfigured } from "@/lib/stripe-server";

/** True when PayPal subscription checkout can run (client id, secret, both plan ids). */
export function paypalSubscriptionBillingConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID?.trim() &&
      process.env.PAYPAL_SECRET?.trim() &&
      process.env.PAYPAL_PLAN_MONTHLY?.trim() &&
      process.env.PAYPAL_PLAN_ANNUAL?.trim(),
  );
}

export function paymentEnvStatus(): {
  stripeSubscriptions: boolean;
  stripeVesselListing: boolean;
  paypalSubscriptions: boolean;
} {
  return {
    stripeSubscriptions: stripeSubscriptionsConfigured(),
    stripeVesselListing: stripeVesselListingConfigured(),
    paypalSubscriptions: paypalSubscriptionBillingConfigured(),
  };
}
