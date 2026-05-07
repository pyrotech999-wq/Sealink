import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe-server";
import { persistStripeSubscriptionFromApi } from "@/lib/stripe-subscription-sync";
import { applyVesselClassifiedStripePayment } from "@/lib/vessel-stripe-complete";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature!,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new NextResponse(`Webhook Error: ${msg}`, { status: 400 });
  }

  console.log("WEBHOOK RECEIVED");
  console.log("EVENT TYPE", event.type);

  const stripe = getStripe();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id ?? null;
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            await persistStripeSubscriptionFromApi(
              sub,
              session.client_reference_id ?? session.metadata?.user_uid ?? null,
            );
          }
        } else if (session.mode === "payment" && session.metadata?.purpose === "vessel_classified") {
          const full = await stripe.checkout.sessions.retrieve(session.id, { expand: ["payment_intent"] });
          const applied = await applyVesselClassifiedStripePayment(full);
          if (!applied.ok) {
            console.warn("[stripe webhook] vessel checkout:", applied.error);
          }
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await persistStripeSubscriptionFromApi(sub);
        break;
      }
      default:
        break;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stripe webhook]", event.type, msg);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
