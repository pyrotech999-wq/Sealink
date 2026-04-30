type PayPalEnv = "sandbox" | "live";

function env(): PayPalEnv {
  return (process.env.PAYPAL_ENV?.trim().toLowerCase() === "live" ? "live" : "sandbox") as PayPalEnv;
}

export function paypalBaseUrl(): string {
  return env() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function paypalClientId(): string | null {
  const v = process.env.PAYPAL_CLIENT_ID?.trim();
  return v ? v : null;
}

function paypalSecret(): string | null {
  const v = process.env.PAYPAL_SECRET?.trim();
  return v ? v : null;
}

export async function paypalAccessToken(): Promise<string> {
  const id = paypalClientId();
  const secret = paypalSecret();
  if (!id || !secret) throw new Error("PAYPAL_NOT_CONFIGURED");

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`PAYPAL_TOKEN_${res.status}:${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("PAYPAL_TOKEN_EMPTY");
  return data.access_token;
}

