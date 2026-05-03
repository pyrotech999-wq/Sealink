import { Apple, Facebook, Google, generateCodeVerifier, generateState } from "arctic";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_EMAIL_COOKIE } from "@/lib/auth";
import { trimEnvValue } from "@/lib/env-trim";
import { registerAccountDevice } from "@/lib/account-devices-store";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";
import {
  OAUTH_STATE_COOKIE,
  isOauthStateSigningConfigured,
  signOauthStatePayload,
  verifyOauthStateCookie,
  type OauthProviderId,
} from "@/lib/oauth-pkce-cookie";
import {
  appleOAuthConfigured,
  applePrivateKeyPkcs8Der,
  facebookOAuthConfigured,
  googleOAuthConfigured,
  oauthCallbackUrl,
} from "@/lib/oauth-provider-config";
import { MAX_PROFILE_DISPLAY_NAME_LEN, validateProfileDisplayName } from "@/lib/profile-display-name";
import { upsertProfileAfterSignUp } from "@/lib/profiles-server";
import { sessionCookieBase } from "@/lib/session-cookies";
import { oauthSignInOrRegister } from "@/lib/users-store";
import { isGoogleFacebookOAuthUiShown } from "@/lib/oauth-ui-suppress";

export const runtime = "nodejs";

function pickDisplayName(email: string, ...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    const t = (c ?? "").trim();
    if (validateProfileDisplayName(t) === null) {
      return t.length > MAX_PROFILE_DISPLAY_NAME_LEN ? t.slice(0, MAX_PROFILE_DISPLAY_NAME_LEN) : t;
    }
  }
  const local = email.split("@")[0]?.replace(/[.+_]/g, " ").replace(/\s+/g, " ").trim() ?? "";
  if (validateProfileDisplayName(local) === null) {
    return local.length > MAX_PROFILE_DISPLAY_NAME_LEN ? local.slice(0, MAX_PROFILE_DISPLAY_NAME_LEN) : local;
  }
  return "Member";
}

function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split(".");
  if (parts.length < 2) return {};
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errRedirectAbsolute(req: NextRequest, path: "/sign-in" | "/sign-up", code: string): NextResponse {
  const dest = new URL(path, req.nextUrl.origin);
  dest.searchParams.set("oauth_err", code);
  return NextResponse.redirect(dest, 302);
}

function clearStateCookie(res: NextResponse): void {
  res.cookies.set(OAUTH_STATE_COOKIE, "", { ...sessionCookieBase(), maxAge: 0 });
}

function applySessionCookies(res: NextResponse, email: string, rememberMe: boolean): void {
  const base = sessionCookieBase();
  const sessionMaxAge = rememberMe ? 60 * 60 * 24 * 180 : 60 * 60 * 24 * 14;
  const emailMaxAge = rememberMe ? 60 * 60 * 24 * 365 : 60 * 60 * 24 * 180;
  res.cookies.set(DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE, { ...base, maxAge: sessionMaxAge });
  res.cookies.set(AUTH_EMAIL_COOKIE, email, { ...base, maxAge: emailMaxAge });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await ctx.params;
  if (raw !== "google" && raw !== "facebook" && raw !== "apple") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  const provider = raw as OauthProviderId;
  const code = req.nextUrl.searchParams.get("code");
  const stateQ = req.nextUrl.searchParams.get("state") ?? "";

  if (!code) {
    return oauthAuthorize(req, provider);
  }
  return oauthTokenExchange(req, provider, code, stateQ);
}

/** Apple may return `response_mode=form_post` (body) instead of query params. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await ctx.params;
  if (raw !== "apple") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }
  const provider = raw as OauthProviderId;
  let code = "";
  let stateQ = "";
  let userJson: string | undefined;
  try {
    const form = await req.formData();
    const c = form.get("code");
    const s = form.get("state");
    code = typeof c === "string" ? c : "";
    stateQ = typeof s === "string" ? s : "";
    const u = form.get("user");
    if (typeof u === "string" && u) userJson = u;
  } catch {
    return errRedirectAbsolute(req, "/sign-in", "token");
  }
  if (!code || !stateQ) {
    return errRedirectAbsolute(req, "/sign-in", "token");
  }
  const url = new URL(req.url);
  url.searchParams.set("code", code);
  url.searchParams.set("state", stateQ);
  if (userJson) url.searchParams.set("user", userJson);
  const synthetic = new NextRequest(url, { headers: req.headers });
  return oauthTokenExchange(synthetic, provider, code, stateQ);
}

async function oauthAuthorize(req: NextRequest, provider: OauthProviderId): Promise<NextResponse> {
  if (!isOauthStateSigningConfigured()) {
    return NextResponse.json({ error: "OAuth is not configured (set OAUTH_PKCE_SECRET)." }, { status: 503 });
  }

  if ((provider === "google" || provider === "facebook") && !isGoogleFacebookOAuthUiShown()) {
    return NextResponse.json({ error: "Google and Facebook sign-in are not enabled yet." }, { status: 503 });
  }

  const redirectUri = oauthCallbackUrl(provider);
  const state = generateState();
  const exp = Math.floor(Date.now() / 1000) + 15 * 60;
  const deviceId = req.nextUrl.searchParams.get("deviceId")?.trim().slice(0, 128) ?? "";
  const deviceName = req.nextUrl.searchParams.get("deviceName")?.trim().slice(0, 200) ?? "";

  let loc: URL;
  if (provider === "google") {
    if (!googleOAuthConfigured()) {
      return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 503 });
    }
    const id = trimEnvValue(process.env.GOOGLE_CLIENT_ID);
    const secret = trimEnvValue(process.env.GOOGLE_CLIENT_SECRET);
    const google = new Google(id, secret, redirectUri);
    const codeVerifier = generateCodeVerifier();
    const signed = signOauthStatePayload({
      provider,
      state,
      codeVerifier,
      deviceId: deviceId || undefined,
      deviceName: deviceName || undefined,
      exp,
    });
    if (!signed) {
      return NextResponse.json({ error: "Could not start OAuth." }, { status: 500 });
    }
    loc = google.createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);
    const res = NextResponse.redirect(loc, 302);
    res.cookies.set(OAUTH_STATE_COOKIE, signed, { ...sessionCookieBase(), maxAge: 15 * 60 });
    return res;
  }

  if (provider === "facebook") {
    if (!facebookOAuthConfigured()) {
      return NextResponse.json({ error: "Facebook sign-in is not configured." }, { status: 503 });
    }
    const id = trimEnvValue(process.env.FACEBOOK_CLIENT_ID);
    const secret = trimEnvValue(process.env.FACEBOOK_CLIENT_SECRET);
    const fb = new Facebook(id, secret, redirectUri);
    const signed = signOauthStatePayload({
      provider,
      state,
      deviceId: deviceId || undefined,
      deviceName: deviceName || undefined,
      exp,
    });
    if (!signed) return NextResponse.json({ error: "Could not start OAuth." }, { status: 500 });
    loc = fb.createAuthorizationURL(state, ["email", "public_profile"]);
    const res = NextResponse.redirect(loc, 302);
    res.cookies.set(OAUTH_STATE_COOKIE, signed, { ...sessionCookieBase(), maxAge: 15 * 60 });
    return res;
  }

  if (!appleOAuthConfigured()) {
    return NextResponse.json({ error: "Apple sign-in is not configured." }, { status: 503 });
  }
  const clientId = trimEnvValue(process.env.APPLE_CLIENT_ID);
  const teamId = trimEnvValue(process.env.APPLE_TEAM_ID);
  const keyId = trimEnvValue(process.env.APPLE_KEY_ID);
  const pk = applePrivateKeyPkcs8Der();
  if (!pk) {
    return NextResponse.json({ error: "Apple private key is invalid." }, { status: 500 });
  }
  const apple = new Apple(clientId, teamId, keyId, pk, redirectUri);
  const signed = signOauthStatePayload({
    provider,
    state,
    deviceId: deviceId || undefined,
    deviceName: deviceName || undefined,
    exp,
  });
  if (!signed) return NextResponse.json({ error: "Could not start OAuth." }, { status: 500 });
  loc = apple.createAuthorizationURL(state, ["name", "email"]);
  const res = NextResponse.redirect(loc, 302);
  res.cookies.set(OAUTH_STATE_COOKIE, signed, { ...sessionCookieBase(), maxAge: 15 * 60 });
  return res;
}

async function oauthTokenExchange(
  req: NextRequest,
  provider: OauthProviderId,
  code: string,
  stateQ: string,
): Promise<NextResponse> {
  const cookieRaw = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const payload = verifyOauthStateCookie(cookieRaw);
  if (!payload || payload.provider !== provider || payload.state !== stateQ) {
    return errRedirectAbsolute(req, "/sign-in", "state");
  }

  if ((provider === "google" || provider === "facebook") && !isGoogleFacebookOAuthUiShown()) {
    const res = errRedirectAbsolute(req, "/sign-in", "disabled");
    clearStateCookie(res);
    return res;
  }

  const redirectUri = oauthCallbackUrl(provider);
  let email = "";
  let sub = "";
  let displayHint = "";

  try {
    if (provider === "google") {
      if (!googleOAuthConfigured() || !payload.codeVerifier) {
        const res = errRedirectAbsolute(req, "/sign-in", "config");
        clearStateCookie(res);
        return res;
      }
      const id = trimEnvValue(process.env.GOOGLE_CLIENT_ID);
      const secret = trimEnvValue(process.env.GOOGLE_CLIENT_SECRET);
      const google = new Google(id, secret, redirectUri);
      const tokens = await google.validateAuthorizationCode(code, payload.codeVerifier);
      const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokens.accessToken()}` },
      });
      const j = (await r.json()) as { sub?: string; email?: string; name?: string };
      sub = typeof j.sub === "string" ? j.sub : "";
      email = typeof j.email === "string" ? j.email : "";
      displayHint = typeof j.name === "string" ? j.name : "";
    } else if (provider === "facebook") {
      if (!facebookOAuthConfigured()) {
        const res = errRedirectAbsolute(req, "/sign-in", "config");
        clearStateCookie(res);
        return res;
      }
      const id = trimEnvValue(process.env.FACEBOOK_CLIENT_ID);
      const secret = trimEnvValue(process.env.FACEBOOK_CLIENT_SECRET);
      const fb = new Facebook(id, secret, redirectUri);
      const tokens = await fb.validateAuthorizationCode(code);
      const r = await fetch(
        `https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=${encodeURIComponent(tokens.accessToken())}`,
      );
      const j = (await r.json()) as { id?: string; email?: string; name?: string };
      sub = typeof j.id === "string" ? j.id : "";
      email = typeof j.email === "string" ? j.email : "";
      displayHint = typeof j.name === "string" ? j.name : "";
    } else {
      if (!appleOAuthConfigured()) {
        const res = errRedirectAbsolute(req, "/sign-in", "config");
        clearStateCookie(res);
        return res;
      }
      const clientId = trimEnvValue(process.env.APPLE_CLIENT_ID);
      const teamId = trimEnvValue(process.env.APPLE_TEAM_ID);
      const keyId = trimEnvValue(process.env.APPLE_KEY_ID);
      const pk = applePrivateKeyPkcs8Der();
      if (!pk) {
        const res = errRedirectAbsolute(req, "/sign-in", "config");
        clearStateCookie(res);
        return res;
      }
      const apple = new Apple(clientId, teamId, keyId, pk, redirectUri);
      const tokens = await apple.validateAuthorizationCode(code);
      const idTok = tokens.idToken();
      const claims = decodeJwtPayload(idTok);
      sub = typeof claims.sub === "string" ? claims.sub : "";
      email = typeof claims.email === "string" ? claims.email : "";
      const userJson = req.nextUrl.searchParams.get("user");
      if (userJson) {
        try {
          const u = JSON.parse(userJson) as { name?: { firstName?: string; lastName?: string } };
          const fn = u.name?.firstName?.trim() ?? "";
          const ln = u.name?.lastName?.trim() ?? "";
          displayHint = [fn, ln].filter(Boolean).join(" ");
        } catch {
          /* */
        }
      }
    }
  } catch (e) {
    console.error("[oauth] token exchange failed", provider, e);
    const res = errRedirectAbsolute(req, "/sign-in", "token");
    clearStateCookie(res);
    return res;
  }

  if (!sub || !email) {
    const res = errRedirectAbsolute(req, "/sign-in", "email");
    clearStateCookie(res);
    return res;
  }

  let result;
  try {
    result = await oauthSignInOrRegister({ provider, sub, email });
  } catch (e) {
    console.error("[oauth] account upsert failed", e);
    const res = errRedirectAbsolute(req, "/sign-in", "account");
    clearStateCookie(res);
    return res;
  }

  if (!result.ok) {
    const code =
      result.code === "password_account_exists"
        ? "password_exists"
        : result.code === "supabase_off"
          ? "supabase"
          : "mismatch";
    const res = errRedirectAbsolute(req, "/sign-in", code);
    clearStateCookie(res);
    return res;
  }

  const { user, isNew } = result;
  const fullName = pickDisplayName(email, displayHint);
  if (isNew) {
    try {
      await upsertProfileAfterSignUp(user.uid, { fullName });
    } catch (e) {
      console.error("[oauth] profile upsert failed", e);
    }
  }

  if (payload.deviceId) {
    try {
      await registerAccountDevice(user.uid, payload.deviceId, payload.deviceName || "Device", 2);
    } catch (e) {
      console.error("[oauth] device registration failed", e);
    }
  }

  const dest = new URL("/", req.nextUrl.origin);
  const res = NextResponse.redirect(dest, 302);
  clearStateCookie(res);
  applySessionCookies(res, user.email, true);
  return res;
}
