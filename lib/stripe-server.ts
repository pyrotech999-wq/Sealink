import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeSingleton) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}

/** Base URL for Checkout success/cancel redirects (no trailing slash). */
export function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

function isResourceMissing(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "resource_missing"
  );
}

/**
 * Deterministic Stripe coupon per discount % so we do not create duplicates.
 * Applies forever on the subscription after trial.
 */
export async function getOrCreateRecurringPercentCoupon(stripe: Stripe, percentOff: number): Promise<string> {
  if (percentOff < 1 || percentOff > 100) {
    throw new Error("percentOff must be between 1 and 100");
  }
  const id = `sealink_recur_${percentOff}`;
  try {
    await stripe.coupons.retrieve(id);
    return id;
  } catch (err: unknown) {
    if (!isResourceMissing(err)) throw err;
  }
  await stripe.coupons.create({
    id,
    percent_off: percentOff,
    duration: "forever",
    name: `SeaLink ${percentOff}% off recurring`,
  });
  return id;
}
