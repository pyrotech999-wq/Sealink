import { resolvePublicAppOrigin } from "@/lib/public-app-url";

/** Base URL for redirects (no trailing slash). */
export function getAppBaseUrl(): string {
  return resolvePublicAppOrigin();
}

