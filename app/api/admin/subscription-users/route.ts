import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { listUserAccountsBrief } from "@/lib/users-store";
import { getSubscriptionAccessDetail } from "@/lib/subscription-access";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const user = await getAuthUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const accounts = await listUserAccountsBrief();
  const users = await Promise.all(
    accounts.map(async (a) => {
      const d = await getSubscriptionAccessDetail(a.uid);
      return {
        uid: a.uid,
        email: a.email,
        createdAt: a.createdAt,
        paypalStatus: d.paypalStatus,
        freeAccessGranted: d.freeAccessGranted,
        hasAccess: d.hasAccess,
      };
    }),
  );

  return NextResponse.json({ ok: true as const, users });
}
