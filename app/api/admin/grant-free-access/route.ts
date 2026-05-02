import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { setAdminGrantedFreeAccess } from "@/lib/admin-free-access-store";
import { cancelPayPalBillingSubscription, paypalClientId } from "@/app/api/vessels/classifieds/paypal/_paypal";
import { getPayPalSubscriptionByUser, upsertPayPalSubscription } from "@/lib/paypal-subscription-store";
import { paypalSubscriptionIsActiveForBilling } from "@/lib/subscription-access";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const admin = await getAuthUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const uid = typeof o?.uid === "string" ? o.uid.trim() : "";
  const granted = o?.granted === true;
  if (!uid || uid.length < 8) return NextResponse.json({ error: "uid required" }, { status: 400 });
  if (uid === admin.uid) {
    return NextResponse.json({ error: "Use PayPal or another account for your own billing; admin self-grant disabled." }, { status: 400 });
  }

  let paypalCancelled = false;

  if (granted) {
    const sub = await getPayPalSubscriptionByUser(uid);
    if (sub?.subscriptionId && paypalSubscriptionIsActiveForBilling(sub.status)) {
      if (!paypalClientId()) {
        return NextResponse.json(
          { error: "PayPal is not configured; cannot cancel an active subscription before granting complimentary access." },
          { status: 503 },
        );
      }
      try {
        await cancelPayPalBillingSubscription(
          sub.subscriptionId,
          "SeaLink admin granted complimentary access — subscription no longer required.",
        );
        paypalCancelled = true;
        await upsertPayPalSubscription({
          userUid: uid,
          subscriptionId: sub.subscriptionId,
          status: "CANCELLED",
          plan: sub.plan,
          raw: { ...(typeof sub.raw === "object" && sub.raw !== null ? sub.raw : {}), cancelledForComplimentary: true },
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "PayPal cancel failed";
        return NextResponse.json(
          { error: `Could not cancel PayPal subscription: ${msg}. Complimentary access was not enabled.` },
          { status: 502 },
        );
      }
    }
  }

  try {
    await setAdminGrantedFreeAccess(uid, granted);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, uid, granted, paypalCancelled });
}
