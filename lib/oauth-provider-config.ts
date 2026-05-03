import { trimEnvValue } from "@/lib/env-trim";
import { resolvePublicAppOrigin } from "@/lib/public-app-url";
import type { OauthProviderId } from "@/lib/oauth-pkce-cookie";
import { createPrivateKey } from "crypto";

export function oauthCallbackUrl(provider: OauthProviderId): string {
  return `${resolvePublicAppOrigin()}/api/auth/oauth/${provider}`;
}

export function googleOAuthConfigured(): boolean {
  const id = trimEnvValue(process.env.GOOGLE_CLIENT_ID);
  const secret = trimEnvValue(process.env.GOOGLE_CLIENT_SECRET);
  return Boolean(id && secret);
}

export function facebookOAuthConfigured(): boolean {
  const id = trimEnvValue(process.env.FACEBOOK_CLIENT_ID);
  const secret = trimEnvValue(process.env.FACEBOOK_CLIENT_SECRET);
  return Boolean(id && secret);
}

export function appleOAuthConfigured(): boolean {
  const id = trimEnvValue(process.env.APPLE_CLIENT_ID);
  const team = trimEnvValue(process.env.APPLE_TEAM_ID);
  const keyId = trimEnvValue(process.env.APPLE_KEY_ID);
  const pem = trimEnvValue(process.env.APPLE_PRIVATE_KEY);
  return Boolean(id && team && keyId && pem);
}

/** PKCS#8 DER bytes for Apple client secret JWT (Arctic). */
export function applePrivateKeyPkcs8Der(): Uint8Array | null {
  const pem = trimEnvValue(process.env.APPLE_PRIVATE_KEY);
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
