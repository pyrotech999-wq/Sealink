import { getPayPalSubscriptionByUser } from "@/lib/paypal-subscription-store";
import { getStripeSubscriptionByUser } from "@/lib/stripe-subscription-store";
import { getAdminGrantedFreeAccess } from "@/lib/admin-free-access-store";
import { isReservedOwner } from "@/lib/reserved-admin";
import { getUserEmailByUid } from "@/lib/users-store";

/** PayPal billing subscription states that count as paid/trial access for in-app benefits. */
export const PAYPAL_ACCESS_STATUSES = new Set([
  "ACTIVE",
  "APPROVED",
  "TRIALING",
  /** Present briefly after buyer approves until activation completes; must match `/api/paypal/subscription/verify`. */
  "APPROVAL_PENDING",
]);

/** Stripe subscription statuses that grant app access (lowercase as returned by the Stripe API). */
export const STRIPE_ACCESS_STATUSES = new Set(["trialing", "active"]);

export function stripeSubscriptionIsActiveForBilling(status: string | null | undefined): boolean {
  const s = status?.trim().toLowerCase() ?? "";
  return Boolean(s && STRIPE_ACCESS_STATUSES.has(s));
}

export async function hasAppSubscriptionAccess(userUid: string): Promise<boolean> {
  const email = await getUserEmailByUid(userUid);
  if (email && (await isReservedOwner(email, userUid))) return true;
  if (await getAdminGrantedFreeAccess(userUid)) return true;
  const stripeSub = await getStripeSubscriptionByUser(userUid);
  if (stripeSub?.status && stripeSubscriptionIsActiveForBilling(stripeSub.status)) return true;
  const sub = await getPayPalSubscriptionByUser(userUid);
  if (!sub?.status) return false;
  return PAYPAL_ACCESS_STATUSES.has(sub.status.trim().toUpperCase());
}

export function paypalSubscriptionIsActiveForBilling(status: string | null | undefined): boolean {
  if (!status?.trim()) return false;
  return PAYPAL_ACCESS_STATUSES.has(status.trim().toUpperCase());
}

export type SubscriptionAccessDetail = {
  hasAccess: boolean;
  source: "reserved" | "admin_grant" | "stripe" | "paypal" | "none";
  paypalStatus: string | null;
  stripeStatus: string | null;
  freeAccessGranted: boolean;
};

export async function getSubscriptionAccessDetail(userUid: string): Promise<SubscriptionAccessDetail> {
  const email = await getUserEmailByUid(userUid);
  if (email && (await isReservedOwner(email, userUid))) {
    return { hasAccess: true, source: "reserved", paypalStatus: null, stripeStatus: null, freeAccessGranted: false };
  }

  const free = await getAdminGrantedFreeAccess(userUid);
  const [payPalSub, stripeSub] = await Promise.all([
    getPayPalSubscriptionByUser(userUid),
    getStripeSubscriptionByUser(userUid),
  ]);
  const pst = payPalSub?.status?.trim().toUpperCase() ?? null;
  const sst = stripeSub?.status?.trim().toLowerCase() ?? null;

  if (free) {
    return { hasAccess: true, source: "admin_grant", paypalStatus: pst, stripeStatus: sst, freeAccessGranted: true };
  }
  if (stripeSubscriptionIsActiveForBilling(sst)) {
    return { hasAccess: true, source: "stripe", paypalStatus: pst, stripeStatus: sst, freeAccessGranted: false };
  }
  if (pst && PAYPAL_ACCESS_STATUSES.has(pst)) {
    return { hasAccess: true, source: "paypal", paypalStatus: pst, stripeStatus: sst, freeAccessGranted: false };
  }
  return { hasAccess: false, source: "none", paypalStatus: pst, stripeStatus: sst, freeAccessGranted: false };
}
