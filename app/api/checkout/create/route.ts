import { NextResponse } from "next/server";
import { TRIAL_DAYS } from "@/lib/pricing";
import type { BillingPlan } from "@/lib/pricing";
import { getAppBaseUrl, getOrCreateRecurringPercentCoupon, getStripe } from "@/lib/stripe-server";
import { validateVoucherCode } from "@/lib/vouchers";

/** Accept legacy clients that still send `yearly`. */
function normalisePlan(v: unknown): BillingPlan | null {
  if (v === "monthly" || v === "annual") return v;
  if (v === "yearly") return "annual";
  return null;
}

export async function POST(req: Request) {
  const priceMonthly = process.env.STRIPE_PRICE_MONTHLY?.trim();
  const priceAnnual =
    process.env.STRIPE_PRICE_ANNUAL?.trim() ?? process.env.STRIPE_PRICE_YEARLY?.trim();
  if (!priceMonthly || !priceAnnual) {
    return NextResponse.json(
      {
        error:
          "Stripe price IDs are not configured. Set STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL (or legacy STRIPE_PRICE_YEARLY) in .env.local.",
      },
      { status: 503 },
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
  if (!plan) {
    return NextResponse.json({ error: "Invalid or missing plan (use monthly or annual)" }, { status: 400 });
  }

  const rawCode =
    typeof body === "object" && body !== null && "voucherCode" in body
      ? String((body as { voucherCode: unknown }).voucherCode ?? "").trim()
      : "";

  let discountPercent = 0;
  if (rawCode) {
    const v = validateVoucherCode(rawCode);
    if (!v.ok) {
      return NextResponse.json({ error: v.message }, { status: 400 });
    }
    discountPercent = v.discountPercent;
  }

  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json(
      { error: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env.local." },
      { status: 503 },
    );
  }

  const priceId = plan === "monthly" ? priceMonthly : priceAnnual;
  const base = getAppBaseUrl();

  const discounts =
    discountPercent > 0
      ? [{ coupon: await getOrCreateRecurringPercentCoupon(stripe, discountPercent) }]
      : undefined;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: {
          plan,
          ...(rawCode ? { voucher_code: rawCode.toUpperCase() } : {}),
        },
      },
      ...(discounts ? { discounts } : {}),
      success_url: `${base}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/payment?canceled=1`,
      metadata: {
        plan,
        ...(rawCode ? { voucher_code: rawCode.toUpperCase() } : {}),
      },
      // Stripe: cannot use `allow_promotion_codes` together with `discounts`.
      allow_promotion_codes: !discounts,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Checkout session did not return a URL" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
