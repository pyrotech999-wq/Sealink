/**
 * Canonical public origin (no trailing slash) for redirects, metadataBase, and PWA manifest.
 * Production: set NEXT_PUBLIC_APP_URL on the host (e.g. https://sealinkapp.com).
 */
export function resolvePublicAppOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (explicit && explicit.length > 0) return explicit;
  const vercel = process.env.VERCEL_URL?.trim().replace(/\/+$/, "");
  if (vercel && vercel.length > 0) {
    return vercel.startsWith("http://") || vercel.startsWith("https://") ? vercel : `https://${vercel}`;
  }
  return "http://localhost:3000";
}
