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

/**
 * Google/Facebook on sign-in/up are opt-in until those flows are verified.
 * Apple is not gated by this flag. Set SHOW_GOOGLE_FACEBOOK_OAUTH=1 when ready.
 */
export function isGoogleFacebookOAuthUiShown(): boolean {
  const v = trimEnvValue(process.env.SHOW_GOOGLE_FACEBOOK_OAUTH);
  if (!v) return false;
  const l = v.toLowerCase();
  return v === "1" || l === "true" || l === "yes";
}
