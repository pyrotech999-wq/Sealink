import { createHmac, timingSafeEqual } from "crypto";

export const OAUTH_STATE_COOKIE = "sealink_oauth_state";

export type OauthProviderId = "google" | "facebook" | "apple";

export type OauthStatePayload = {
  provider: OauthProviderId;
  state: string;
  /** Google only — PKCE verifier */
  codeVerifier?: string;
  deviceId?: string;
  deviceName?: string;
  exp: number;
};

function oauthSecret(): string | null {
  const s = process.env.OAUTH_PKCE_SECRET?.trim();
  if (s && s.length >= 16) return s;
  return null;
}

export function isOauthStateSigningConfigured(): boolean {
  return oauthSecret() !== null;
}

export function signOauthStatePayload(payload: OauthStatePayload): string | null {
  const secret = oauthSecret();
  if (!secret) return null;
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOauthStateCookie(cookieVal: string | undefined): OauthStatePayload | null {
  const secret = oauthSecret();
  if (!secret || !cookieVal?.includes(".")) return null;
  const i = cookieVal.lastIndexOf(".");
  const body = cookieVal.slice(0, i);
  const sig = cookieVal.slice(i + 1);
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OauthStatePayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.state !== "string" || typeof parsed.exp !== "number") return null;
    if (Date.now() / 1000 > parsed.exp) return null;
    if (parsed.provider !== "google" && parsed.provider !== "facebook" && parsed.provider !== "apple") return null;
    return parsed;
  } catch {
    return null;
  }
}
