import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;
let stripeSingletonKey: string | null = null;

export function stripeSecretKey(): string | null {
  const k = process.env.STRIPE_SECRET_KEY?.trim();
  return k || null;
}

export function stripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function getStripe(): Stripe {
  const key = stripeSecretKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!stripeSingleton || stripeSingletonKey !== key) {
    stripeSingleton = new Stripe(key, { typescript: true });
    stripeSingletonKey = key;
  }
  return stripeSingleton;
}

export function stripeSubscriptionPriceIds(): { monthly: string | null; annual: string | null } {
  return {
    monthly: process.env.STRIPE_PRICE_MONTHLY?.trim() || null,
    annual: process.env.STRIPE_PRICE_ANNUAL?.trim() || null,
  };
}

export function stripeSubscriptionsConfigured(): boolean {
  const { monthly, annual } = stripeSubscriptionPriceIds();
  return Boolean(stripeSecretKey() && monthly && annual);
}

/** One-off vessel listing checkout uses inline price_data; only the secret key is required. */
export function stripeVesselListingConfigured(): boolean {
  return Boolean(stripeSecretKey());
}
