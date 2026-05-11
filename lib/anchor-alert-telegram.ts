import { resolvePublicAppOrigin } from "@/lib/public-app-url";

function isTelegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/**
 * Sends a Telegram message via the Bot API when an anchor geofence alert fires.
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.
 * Fire-and-forget: does not block the HTTP response.
 */
export function sendAnchorGeofenceAlertTelegram(alertMessage: string): void {
  if (!isTelegramConfigured()) return;

  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const origin = resolvePublicAppOrigin();

  const text = [
    "⚓ *SeaLink anchor alert*",
    "",
    alertMessage.trim(),
    "",
    `[Open SeaLink](${origin}/anchor-alarm)`,
  ].join("\n");

  void fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  })
    .then(async (r) => {
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        console.warn("[anchor-alert-telegram] send failed", r.status, body);
      }
    })
    .catch((e) => {
      console.warn("[anchor-alert-telegram] fetch failed", e instanceof Error ? e.message : e);
    });
}
