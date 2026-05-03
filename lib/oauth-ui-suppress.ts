import { trimEnvValue } from "@/lib/env-trim";

/**
 * When true, `/api/auth/oauth/config` reports no providers — sign-in/up hide OAuth buttons
 * and the “missing PKCE” banner. Toggle without code changes (set on host, redeploy).
 */
export function isOauthUiSuppressed(): boolean {
  const v = trimEnvValue(process.env.HIDE_OAUTH_UI);
  if (!v) return false;
  const l = v.toLowerCase();
  return v === "1" || l === "true" || l === "yes";
}
