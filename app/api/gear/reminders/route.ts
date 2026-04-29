import { NextResponse } from "next/server";
import { applySellerCookie, resolveSellerUid } from "@/lib/gear-api-helpers";
import { GEAR_REMINDER_DAYS_BEFORE } from "@/lib/gear-constants";
import { daysUntilExpiry, isInReminderWindow, loadGearListings } from "@/lib/gear-store";

export const runtime = "nodejs";

/** In-app reminders for your listings nearing auto-deletion (email can be wired later). */
export async function GET() {
  const { uid, cookieFresh } = await resolveSellerUid();
  const now = new Date();
  const all = await loadGearListings();

  const items = all
    .filter((l) => l.sellerUid === uid && !l.soldAt && isInReminderWindow(l.expiresAt, now))
    .map((l) => ({
      id: l.id,
      title: l.title,
      expiresAt: l.expiresAt,
      daysLeft: daysUntilExpiry(l.expiresAt, now),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const res = NextResponse.json({
    items,
    reminderDaysBefore: GEAR_REMINDER_DAYS_BEFORE,
    message:
      items.length > 0
        ? `These listings will be removed automatically in up to ${GEAR_REMINDER_DAYS_BEFORE} days unless you extend them.`
        : null,
  });
  if (cookieFresh) applySellerCookie(res, uid);
  return res;
}
