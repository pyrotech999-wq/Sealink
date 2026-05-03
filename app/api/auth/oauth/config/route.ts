import { NextResponse } from "next/server";
import { isOauthStateSigningConfigured } from "@/lib/oauth-pkce-cookie";
import { isGoogleFacebookOAuthUiShown, isOauthUiSuppressed } from "@/lib/oauth-ui-suppress";
import {
  appleOAuthConfigured,
  facebookOAuthConfigured,
  googleOAuthConfigured,
} from "@/lib/oauth-provider-config";

export const runtime = "nodejs";

/** Never cache: env toggles OAuth without redeploying static HTML. */
export const dynamic = "force-dynamic";

/** Public: which OAuth providers are configured (no secrets). */
export async function GET() {
  if (isOauthUiSuppressed()) {
    return NextResponse.json(
      {
        enabled: false,
        google: false,
        facebook: false,
        apple: false,
        googleCredentialsSet: false,
        pkceConfigured: false,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        },
      },
    );
  }

  const base = isOauthStateSigningConfigured();
  const googleCreds = googleOAuthConfigured();
  const facebookCreds = facebookOAuthConfigured();
  const appleCreds = appleOAuthConfigured();
  const showGoogleFacebook = isGoogleFacebookOAuthUiShown();
  const googleOn = Boolean(base && googleCreds && showGoogleFacebook);
  const facebookOn = Boolean(base && facebookCreds && showGoogleFacebook);
  const appleOn = Boolean(base && appleCreds);
  return NextResponse.json(
    {
      enabled: googleOn || facebookOn || appleOn,
      google: googleOn,
      facebook: facebookOn,
      apple: appleOn,
      /** Google client id/secret set — only true when GF UI is enabled (avoids PKCE banner while buttons are off). */
      googleCredentialsSet: Boolean(googleCreds && showGoogleFacebook),
      pkceConfigured: base,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    },
  );
}
