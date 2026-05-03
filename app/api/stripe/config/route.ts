import { NextResponse } from "next/server";
import { stripeSubscriptionsConfigured, stripeVesselListingConfigured } from "@/lib/stripe-server";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return NextResponse.json({
    ok: true as const,
    subscriptions: stripeSubscriptionsConfigured(),
    vesselListing: stripeVesselListingConfigured(),
  });
}
