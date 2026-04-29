import { NextResponse } from "next/server";
import { validateVoucherCode } from "@/lib/vouchers";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ valid: false, message: "Invalid JSON" }, { status: 400 });
  }

  const code = typeof body === "object" && body !== null && "code" in body ? String((body as { code: unknown }).code) : "";

  const result = validateVoucherCode(code);
  if (!result.ok) {
    return NextResponse.json({ valid: false, message: result.message }, { status: 400 });
  }

  return NextResponse.json({
    valid: true,
    discountPercent: result.discountPercent,
  });
}
