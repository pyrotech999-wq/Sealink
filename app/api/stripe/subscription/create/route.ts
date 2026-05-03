import { NextResponse } from "next/server";
import { TRIAL_DAYS, type BillingPlan } from "@/lib/pricing";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { getAuthUser } from "@/lib/auth";
import { hasAppSubscriptionAccess } from "@/lib/subscription-access";
import { getStripe, stripeSecretKey, stripeSubscriptionPriceIds } from "@/lib/stripe-server";

function normalisePlan(v: unknown): BillingPlan | null {
  if (v === "monthly" || v === "annual") return v;
  if (v === "yearly") return "annual";
  return null;
}

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const { monthly, annual } = stripeSubscriptionPriceIds();
  if (!stripeSecretKey() || !monthly || !annual) {
    return NextResponse.json(
      {
        error:
          "Stripe subscriptions are not configured. Set STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL (recurring Prices in Stripe Dashboard) in your environment.",
      },
      { status: 503 },
    );
  }

  const auth = await getAuthUser().catch(() => null);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (await hasAppSubscriptionAccess(auth.uid)) {
    return NextResponse.json(
      { error: "You already have active or complimentary access. No new subscription is needed." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawPlan = typeof body === "object" && body !== null && "plan" in body ? (body as { plan: unknown }).plan : undefined;
  const plan = normalisePlan(rawPlan);
  if (!plan) return NextResponse.json({ error: "Invalid or missing plan (use monthly or annual)" }, { status: 400 });

  const base = getAppBaseUrl();
  const stripe = getStripe();
  const priceId = plan === "monthly" ? monthly : annual;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/payment/success?provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/payment?canceled=1`,
      client_reference_id: auth.uid,
      metadata: { user_uid: auth.uid, plan },
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { user_uid: auth.uid, plan },
      },
    });
    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
    }
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Stripe checkout could not be started.", detail: msg.slice(0, 800) }, { status: 502 });
  }
}
