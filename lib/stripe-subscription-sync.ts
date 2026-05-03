import type Stripe from "stripe";
import { upsertStripeSubscription } from "@/lib/stripe-subscription-store";

export async function persistStripeSubscriptionFromApi(
  sub: Stripe.Subscription,
  userUidHint?: string | null,
): Promise<void> {
  const uid = (sub.metadata?.user_uid ?? "").trim() || (userUidHint ?? "").trim();
  if (!uid) return;
  const cust = sub.customer;
  const stripeCustomerId = typeof cust === "string" ? cust : cust && !cust.deleted ? cust.id : null;
  const priceId = sub.items.data[0]?.price?.id ?? null;
  await upsertStripeSubscription({
    userUid: uid,
    stripeCustomerId,
    subscriptionId: sub.id,
    status: sub.status,
    priceId,
    raw: sub,
  });
}
