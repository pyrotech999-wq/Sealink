import { NextResponse } from "next/server";
import { getLegacyGearUid, requireGearUser } from "@/lib/gear-api-helpers";
import { GEAR_REMINDER_DAYS_BEFORE } from "@/lib/gear-constants";
import { daysUntilExpiry, isInReminderWindow, loadGearListings } from "@/lib/gear-store";

export const runtime = "nodejs";

/** In-app reminders for your listings nearing auto-deletion (email can be wired later). */
export async function GET() {
  let uid: string;
  let legacyUid: string | null = null;
  try {
    uid = (await requireGearUser()).uid;
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  legacyUid = await getLegacyGearUid();
  const viewerUids = [uid, legacyUid ?? ""].filter(Boolean);
  const now = new Date();
  const all = await loadGearListings();

  const items = all
    .filter((l) => viewerUids.includes(l.sellerUid) && !l.soldAt && isInReminderWindow(l.expiresAt, now))
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
  return res;
}
