import { getPayPalSubscriptionByUser } from "@/lib/paypal-subscription-store";
import { getAdminGrantedFreeAccess } from "@/lib/admin-free-access-store";

/** PayPal billing subscription states that count as paid/trial access for in-app benefits. */
const PAYPAL_ACCESS_STATUSES = new Set(["ACTIVE", "APPROVED", "TRIALING"]);

export async function hasAppSubscriptionAccess(userUid: string): Promise<boolean> {
  if (await getAdminGrantedFreeAccess(userUid)) return true;
  const sub = await getPayPalSubscriptionByUser(userUid);
  if (!sub?.status) return false;
  return PAYPAL_ACCESS_STATUSES.has(sub.status.trim().toUpperCase());
}

export type SubscriptionAccessDetail = {
  hasAccess: boolean;
  source: "admin_grant" | "paypal" | "none";
  paypalStatus: string | null;
  freeAccessGranted: boolean;
};

export async function getSubscriptionAccessDetail(userUid: string): Promise<SubscriptionAccessDetail> {
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
