type Env = {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WHATSAPP_FROM?: string; // e.g. "whatsapp:+14155238886"
};

function getEnv(): Env {
  return process.env as unknown as Env;
}

export function isWhatsAppConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM);
}

/**
 * Sends a WhatsApp message via Twilio.
 * Requires:
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN
 * - TWILIO_WHATSAPP_FROM (e.g. "whatsapp:+14155238886")
 *
 * The `to` must be in Twilio WhatsApp format e.g. "whatsapp:+447700900123".
 */
export async function sendWhatsAppMessage(to: string, body: string): Promise<boolean> {
  const env = getEnv();
  if (!isWhatsAppConfigured()) return false;
  if (!to.startsWith("whatsapp:")) return false;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams();
  form.set("From", env.TWILIO_WHATSAPP_FROM!);
  form.set("To", to);
  form.set("Body", body.slice(0, 1600));

  const token = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  return r.ok;
}

