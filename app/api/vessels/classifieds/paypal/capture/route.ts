import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { loadVesselClassifieds, updateVesselListing, adminUpdateVesselListing } from "@/lib/vessel-classifieds-store";
import { paypalAccessToken, paypalBaseUrl } from "../_paypal";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const listingId =
    typeof body === "object" && body !== null && "listingId" in body ? String((body as { listingId?: unknown }).listingId ?? "") : "";
  const orderId =
    typeof body === "object" && body !== null && "orderId" in body ? String((body as { orderId?: unknown }).orderId ?? "") : "";
  if (!listingId || !orderId) return NextResponse.json({ error: "listingId and orderId required" }, { status: 400 });

  const all = await loadVesselClassifieds();
  const listing = all.find((l) => l.id === listingId);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!u.isAdmin && listing.ownerUid !== u.uid) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const token = await paypalAccessToken().catch(() => null);
  if (!token) return NextResponse.json({ error: "PayPal auth failed." }, { status: 503 });

  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ error: `PayPal error ${res.status}`, detail: t.slice(0, 800) }, { status: 502 });
  }

  const data = (await res.json()) as { status?: string };
  if (data.status !== "COMPLETED") {
    return NextResponse.json({ error: `PayPal status ${data.status ?? "unknown"}` }, { status: 400 });
  }

  const apply = (l: typeof listing) => ({
    ...l,
    paymentStatus: "paid" as const,
    paymentProvider: "paypal" as const,
    paymentRef: orderId,
    status: "active" as const,
  });

  const out = u.isAdmin ? await adminUpdateVesselListing(listingId, apply) : await updateVesselListing(listingId, u.uid, apply);
  if (!out.ok) return NextResponse.json({ error: out.error ?? "Could not activate" }, { status: 400 });

  return NextResponse.json({ ok: true as const });
}

