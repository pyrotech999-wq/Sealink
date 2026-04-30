import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { loadVesselClassifieds, updateVesselListing, adminUpdateVesselListing } from "@/lib/vessel-classifieds-store";
import { paypalAccessToken, paypalBaseUrl, paypalClientId } from "../_paypal";

export const runtime = "nodejs";

const PRICE_GBP = "30.00";

export async function POST(req: Request) {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body === "object" && body !== null && "id" in body ? String((body as { id?: unknown }).id ?? "") : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (!paypalClientId()) return NextResponse.json({ error: "PayPal is not configured." }, { status: 503 });

  const all = await loadVesselClassifieds();
  const listing = all.find((l) => l.id === id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!u.isAdmin && listing.ownerUid !== u.uid) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (listing.status === "removed") return NextResponse.json({ error: "Listing is not payable" }, { status: 400 });
  // Allow renewals: if expired or already paid, we still allow creating a new order to extend.

  let token: string;
  try {
    token = await paypalAccessToken();
  } catch (e: unknown) {
    return NextResponse.json({ error: "PayPal auth failed.", detail: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }

  const base = getAppBaseUrl();
  const returnUrl = `${base}/vessels?paid=1&provider=paypal&listing=${encodeURIComponent(id)}`;
  const cancelUrl = `${base}/vessels?canceled=1`;

  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: id,
          description: listing.status === "expired" || listing.paymentStatus === "paid" ? "SeaLink vessel classified renewal (6 months)" : "SeaLink vessel classified (6 months)",
          amount: { currency_code: "GBP", value: PRICE_GBP },
        },
      ],
      application_context: {
        brand_name: "SeaLink",
        user_action: "PAY_NOW",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ error: `PayPal error ${res.status}`, detail: t.slice(0, 800) }, { status: 502 });
  }

  const data = (await res.json()) as { id?: string; links?: { rel?: string; href?: string }[] };
  const orderId = data.id ?? "";
  const approve = data.links?.find((l) => l.rel === "approve")?.href ?? "";
  if (!orderId || !approve) return NextResponse.json({ error: "PayPal response missing approval link." }, { status: 502 });

  const markPending = (l: typeof listing) => ({
    ...l,
    paymentStatus: "pending" as const,
    paymentProvider: "paypal" as const,
    paymentRef: orderId,
  });
  const out = u.isAdmin ? await adminUpdateVesselListing(id, markPending) : await updateVesselListing(id, u.uid, markPending);
  if (!out.ok) return NextResponse.json({ error: out.error ?? "Could not start payment" }, { status: 400 });

  return NextResponse.json({ approveUrl: approve, orderId });
}

