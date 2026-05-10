import { isSmtpConfigured, sendMail } from "@/lib/mail";
import { resolvePublicAppOrigin } from "@/lib/public-app-url";

/**
 * Sends one email to the signed-in user when a real anchor geofence alert is recorded.
 * No-op if SMTP env is not configured (see {@link isSmtpConfigured}).
 * Fire-and-forget: does not block the HTTP response.
 */
export function sendAnchorGeofenceAlertEmail(userEmail: string, alertMessage: string): void {
  if (!isSmtpConfigured()) return;
  const to = userEmail.replace(/[\r\n]+/g, "").trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;

  const origin = resolvePublicAppOrigin();
  const text = [
    alertMessage.trim(),
    "",
    `Open SeaLink to acknowledge the alert: ${origin}/anchor-alarm`,
    "",
    "This is an automated message; replies are not monitored.",
  ].join("\n");

  void sendMail({
    to,
    subject: "SeaLink — anchor geofence alert",
    text,
  }).then((r) => {
    if (!r.ok) console.warn("[anchor-alert-email] send failed", r.error, { to });
  });
}
