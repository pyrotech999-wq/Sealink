import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getSubscriptionAccessDetail } from "@/lib/subscription-access";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const detail = await getSubscriptionAccessDetail(user.uid);
  return NextResponse.json({ ok: true as const, ...detail });
}
