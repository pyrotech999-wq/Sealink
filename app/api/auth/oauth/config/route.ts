import { NextResponse } from "next/server";
import { isOauthStateSigningConfigured } from "@/lib/oauth-pkce-cookie";
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
  const base = isOauthStateSigningConfigured();
  const googleCreds = googleOAuthConfigured();
  const facebookCreds = facebookOAuthConfigured();
  const appleCreds = appleOAuthConfigured();
  return NextResponse.json(
    {
      enabled: base && (googleCreds || facebookCreds || appleCreds),
      google: base && googleCreds,
      facebook: base && facebookCreds,
      apple: base && appleCreds,
      /** Google client id/secret set (PKCE secret may still be missing). */
      googleCredentialsSet: googleCreds,
      pkceConfigured: base,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    },
  );
}
