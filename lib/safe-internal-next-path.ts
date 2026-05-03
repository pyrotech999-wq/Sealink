/** Same-origin path for post-login redirect (guards against open redirects). */
export function safeInternalPathFromNextParam(nextRaw: string | null): string {
  if (nextRaw == null) return "/";
  const s = String(nextRaw).trim();
  if (!s.startsWith("/") || s.startsWith("//")) return "/";
  if (s.includes("..")) return "/";
  const q = s.indexOf("?");
  const pathOnly = q >= 0 ? s.slice(0, q) : s;
  if (
    pathOnly === "/sign-in" ||
    pathOnly === "/sign-up" ||
    pathOnly === "/forgot-password" ||
    pathOnly === "/reset-password"
  ) {
    return "/";
  }
  return s;
}
