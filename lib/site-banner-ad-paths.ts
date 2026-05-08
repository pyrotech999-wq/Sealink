/** Pages that show the small rotating banner below the MOB dock button. */
export function showSiteBannerAdPath(pathname: string): boolean {
  const p = pathname === "" ? "/" : pathname;
  if (p === "/" || p === "/anchor-alarm" || p === "/ifm" || p === "/weather" || p === "/navigation-charts") return true;
  if (p === "/messaging" || p.startsWith("/messaging/")) return true;
  return false;
}
