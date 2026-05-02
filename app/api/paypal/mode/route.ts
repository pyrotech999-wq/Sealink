import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Public: whether PayPal API calls use live or sandbox (no secrets). */
export async function GET(): Promise<Response> {
  const env = process.env.PAYPAL_ENV?.trim().toLowerCase() === "live" ? "live" : "sandbox";
  const configured = Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_SECRET?.trim());
  return NextResponse.json({ env, configured });
}
