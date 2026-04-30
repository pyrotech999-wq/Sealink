import { NextResponse } from "next/server";
import { isSmtpConfigured } from "@/lib/mail";

export const runtime = "nodejs";

/** Public: whether outbound password-reset email is configured (no secrets). */
export async function GET() {
  return NextResponse.json({ smtpConfigured: isSmtpConfigured() });
}
