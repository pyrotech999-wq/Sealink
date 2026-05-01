import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { normaliseEmailFromInput } from "@/lib/email-normalise";
import { createResetToken } from "@/lib/password-reset-store";
import { sendMail } from "@/lib/mail";
import { getUserByEmail } from "@/lib/users-store";

export const runtime = "nodejs";

function clientIp(req: Request): string | null {
  // Best-effort; Vercel provides x-forwarded-for.
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || null;
  return null;
}

export async function POST(req: Request) {
  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = typeof body.email === "string" ? normaliseEmailFromInput(body.email) : "";
  } catch {
    /* */
  }

  // Always return ok to avoid account enumeration.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: true });
  }

  const user = await getUserByEmail(email);
  if (!user) return NextResponse.json({ ok: true });

  const created = await createResetToken({ email, uid: user.uid, ip: clientIp(req), ttlMinutes: 30 });
  if (!created.ok) return NextResponse.json({ ok: true });

  const base = getAppBaseUrl();
  const link = `${base}/reset-password?token=${encodeURIComponent(created.token)}`;
  const msg =
    `SeaLink password reset\n\n` +
    `Someone requested a password reset for ${email}.\n\n` +
    `Reset your password using this link (valid for 30 minutes):\n` +
    `${link}\n\n` +
    `If you didn’t request this, you can ignore this email.\n`;

  const sent = await sendMail({ to: email, subject: "Reset your SeaLink password", text: msg });

  if (!sent.ok) {
    console.error("[password-reset] mail failed", {
      email,
      error: sent.error,
      hint:
        sent.error === "SMTP_NOT_CONFIGURED"
          ? "Add SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASS on the server (e.g. Vercel env)."
          : "Check SMTP credentials, port (587 vs 465), and that the sender is allowed for your provider.",
    });
  }

  // In dev/non-configured SMTP, allow quick setup by returning the link.
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd && !sent.ok) {
    return NextResponse.json({ ok: true, devLink: link });
  }

  return NextResponse.json({ ok: true });
}

