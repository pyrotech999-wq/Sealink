import { NextResponse } from "next/server";
import { isOauthStateSigningConfigured } from "@/lib/oauth-pkce-cookie";
import {
  appleOAuthConfigured,
  facebookOAuthConfigured,
  googleOAuthConfigured,
} from "@/lib/oauth-provider-config";

export const runtime = "nodejs";

/** Public: which OAuth providers are configured (no secrets). */
export async function GET() {
  const base = isOauthStateSigningConfigured();
  return NextResponse.json({
    enabled: base && (googleOAuthConfigured() || facebookOAuthConfigured() || appleOAuthConfigured()),
    google: base && googleOAuthConfigured(),
    facebook: base && facebookOAuthConfigured(),
    apple: base && appleOAuthConfigured(),
  });
}
