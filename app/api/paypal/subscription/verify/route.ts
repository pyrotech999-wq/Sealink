import { NextResponse } from "next/server";
import { paypalAccessToken, paypalBaseUrl, paypalClientId } from "@/app/api/vessels/classifieds/paypal/_paypal";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!paypalClientId()) return NextResponse.json({ error: "PayPal is not configured." }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id =
    typeof body === "object" && body !== null && "subscriptionId" in body
      ? String((body as { subscriptionId?: unknown }).subscriptionId ?? "")
      : "";
  if (!id) return NextResponse.json({ error: "subscriptionId required" }, { status: 400 });

  const token = await paypalAccessToken().catch(() => null);
  if (!token) return NextResponse.json({ error: "PayPal auth failed." }, { status: 503 });

  const res = await fetch(`${paypalBaseUrl()}/v1/billing/subscriptions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ error: `PayPal error ${res.status}`, detail: t.slice(0, 800) }, { status: 502 });
  }

  const data = (await res.json()) as { status?: string };
  const status = String(data.status ?? "").toUpperCase();
  const ok = status === "ACTIVE" || status === "APPROVAL_PENDING";
  if (!ok) return NextResponse.json({ error: `Subscription status ${status || "unknown"}` }, { status: 400 });

  return NextResponse.json({ ok: true as const, status });
}

