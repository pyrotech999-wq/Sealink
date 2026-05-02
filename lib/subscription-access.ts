import { getPayPalSubscriptionByUser } from "@/lib/paypal-subscription-store";
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

export async function hasAppSubscriptionAccess(userUid: string): Promise<boolean> {
  const email = await getUserEmailByUid(userUid);
  if (email && (await isReservedOwner(email, userUid))) return true;
  if (await getAdminGrantedFreeAccess(userUid)) return true;
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
  source: "reserved" | "admin_grant" | "paypal" | "none";
  paypalStatus: string | null;
  freeAccessGranted: boolean;
};

export async function getSubscriptionAccessDetail(userUid: string): Promise<SubscriptionAccessDetail> {
  const email = await getUserEmailByUid(userUid);
  if (email && (await isReservedOwner(email, userUid))) {
    return { hasAccess: true, source: "reserved", paypalStatus: null, freeAccessGranted: false };
  }
  const free = await getAdminGrantedFreeAccess(userUid);
  if (free) {
    return { hasAccess: true, source: "admin_grant", paypalStatus: null, freeAccessGranted: true };
  }
  const sub = await getPayPalSubscriptionByUser(userUid);
  const st = sub?.status?.trim().toUpperCase() ?? null;
  if (st && PAYPAL_ACCESS_STATUSES.has(st)) {
    return { hasAccess: true, source: "paypal", paypalStatus: st, freeAccessGranted: false };
  }
  return { hasAccess: false, source: "none", paypalStatus: st, freeAccessGranted: false };
}
