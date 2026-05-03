import { resolvePublicAppOrigin } from "@/lib/public-app-url";
import type { OauthProviderId } from "@/lib/oauth-pkce-cookie";
import { createPrivateKey } from "crypto";

export function oauthCallbackUrl(provider: OauthProviderId): string {
  return `${resolvePublicAppOrigin()}/api/auth/oauth/${provider}`;
}

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function facebookOAuthConfigured(): boolean {
  return Boolean(process.env.FACEBOOK_CLIENT_ID?.trim() && process.env.FACEBOOK_CLIENT_SECRET?.trim());
}

export function appleOAuthConfigured(): boolean {
  const id = process.env.APPLE_CLIENT_ID?.trim();
  const team = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const pem = process.env.APPLE_PRIVATE_KEY?.trim();
  return Boolean(id && team && keyId && pem);
}

/** PKCS#8 DER bytes for Apple client secret JWT (Arctic). */
export function applePrivateKeyPkcs8Der(): Uint8Array | null {
  const pem = process.env.APPLE_PRIVATE_KEY?.trim();
  if (!pem) return null;
  try {
    const normalized = pem.replace(/\\n/g, "\n");
    const key = createPrivateKey({ key: normalized, format: "pem" });
    const der = key.export({ format: "der", type: "pkcs8" }) as Buffer;
    return new Uint8Array(der);
  } catch {
    return null;
  }
}
