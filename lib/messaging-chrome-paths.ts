/** Public account-deletion routes: hide messaging nav and alerts even if a session cookie remains. */
export function suppressMessagingChromePath(pathname: string): boolean {
  return (
    pathname === "/delete-data" ||
    pathname.startsWith("/delete-data/") ||
    pathname === "/delete-account" ||
    pathname.startsWith("/delete-account/")
  );
}
