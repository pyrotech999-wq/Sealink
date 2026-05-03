import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getAuthUser } from "@/lib/auth";
import { STRIPE_ACCESS_STATUSES } from "@/lib/subscription-access";
import { getStripe, stripeSecretKey } from "@/lib/stripe-server";
import { persistStripeSubscriptionFromApi } from "@/lib/stripe-subscription-sync";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!stripeSecretKey()) return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId =
    typeof body === "object" && body !== null && "sessionId" in body
      ? String((body as { sessionId?: unknown }).sessionId ?? "").trim()
      : "";
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const user = await getAuthUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Could not load checkout session.", detail: msg.slice(0, 400) }, { status: 502 });
  }

  if (session.mode !== "subscription") {
    return NextResponse.json({ error: "Not a subscription checkout" }, { status: 400 });
  }

  const refUid = (session.client_reference_id ?? "").trim() || (session.metadata?.user_uid ?? "").trim();
  if (!refUid || refUid !== user.uid) {
    return NextResponse.json({ error: "This checkout session does not belong to your account." }, { status: 403 });
  }

  const subRaw = session.subscription;
  if (!subRaw || typeof subRaw === "string") {
    return NextResponse.json({ error: "Subscription not available on session yet. Wait a moment and try again." }, { status: 409 });
  }

  const sub = subRaw as Stripe.Subscription;
  const status = sub.status?.trim().toLowerCase() ?? "";
  if (!status || !STRIPE_ACCESS_STATUSES.has(status)) {
    return NextResponse.json({ error: `Subscription status ${status || "unknown"}` }, { status: 400 });
  }

  try {
    await persistStripeSubscriptionFromApi(sub, user.uid);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Could not save subscription.", detail: msg.slice(0, 400) }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, status });
}
