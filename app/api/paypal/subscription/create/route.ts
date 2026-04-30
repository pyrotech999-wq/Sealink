import { NextResponse } from "next/server";
import { TRIAL_DAYS, type BillingPlan } from "@/lib/pricing";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { paypalAccessToken, paypalBaseUrl, paypalClientId } from "@/app/api/vessels/classifieds/paypal/_paypal";

/** Accept legacy clients that still send `yearly`. */
function normalisePlan(v: unknown): BillingPlan | null {
  if (v === "monthly" || v === "annual") return v;
  if (v === "yearly") return "annual";
  return null;
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  const planMonthly = process.env.PAYPAL_PLAN_MONTHLY?.trim();
  const planAnnual = process.env.PAYPAL_PLAN_ANNUAL?.trim();
  if (!planMonthly || !planAnnual || !paypalClientId()) {
    return NextResponse.json(
      {
        error:
          "PayPal plans are not configured. Set PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_PLAN_MONTHLY and PAYPAL_PLAN_ANNUAL in .env.local.",
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
  if (!plan) return NextResponse.json({ error: "Invalid or missing plan (use monthly or annual)" }, { status: 400 });

  // Vouchers: not supported in PayPal-only beta (ignore if sent by older clients).

  const token = await paypalAccessToken().catch(() => null);
  if (!token) return NextResponse.json({ error: "PayPal auth failed." }, { status: 503 });

  const base = getAppBaseUrl();
  const planId = plan === "monthly" ? planMonthly : planAnnual;

  const res = await fetch(`${paypalBaseUrl()}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: planId,
      application_context: {
        brand_name: "SeaLink",
        user_action: "SUBSCRIBE_NOW",
        return_url: `${base}/payment/success?provider=paypal&plan=${plan}&trial_days=${TRIAL_DAYS}`,
        cancel_url: `${base}/payment?canceled=1`,
      },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ error: `PayPal error ${res.status}`, detail: t.slice(0, 800) }, { status: 502 });
  }

  const data = (await res.json()) as { id?: string; links?: { rel?: string; href?: string }[] };
  const approve = data.links?.find((l) => l.rel === "approve")?.href ?? "";
  if (!approve) return NextResponse.json({ error: "PayPal response missing approval link." }, { status: 502 });

  return NextResponse.json({ approveUrl: approve, subscriptionId: data.id ?? null });
}

