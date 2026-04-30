import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { loadVesselClassifieds, daysUntilExpiry, isInReminderWindow, VESSEL_REMINDER_DAYS_BEFORE } from "@/lib/vessel-classifieds-store";

export const runtime = "nodejs";

/** In-app reminders for vessel adverts nearing expiry (renewal keeps them live). */
export async function GET() {
  const u = await requireAuthUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  const now = new Date();
  const all = await loadVesselClassifieds(now);

  const items = all
    .filter((l) => l.ownerUid === u.uid && l.status === "active" && l.paymentStatus === "paid" && isInReminderWindow(l.expiresAt, now))
    .map((l) => ({
      id: l.id,
      title: l.title,
      expiresAt: l.expiresAt,
      daysLeft: daysUntilExpiry(l.expiresAt, now),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return NextResponse.json({
    items,
    reminderDaysBefore: VESSEL_REMINDER_DAYS_BEFORE,
    message:
      items.length > 0
        ? `These vessel adverts expire within ${VESSEL_REMINDER_DAYS_BEFORE} days. Renew to keep them live for another 6 months.`
        : null,
  });
}

