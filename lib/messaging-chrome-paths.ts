/**
 * Plain static page for app stores / Meta “Data deletion instructions” URL.
 * No main nav, bottom dock, broadcast toasts, MOB overlays, or messaging UI.
 */
export function isBareMetaDataDeletionPage(pathname: string): boolean {
  return pathname === "/delete-my-data" || pathname.startsWith("/delete-my-data/");
}

/** Public account-deletion routes: hide messaging nav and alerts even if a session cookie remains. */
export function suppressMessagingChromePath(pathname: string): boolean {
  if (isBareMetaDataDeletionPage(pathname)) return true;
  return (
    pathname === "/delete-data" ||
    pathname.startsWith("/delete-data/") ||
    pathname === "/delete-account" ||
    pathname.startsWith("/delete-account/")
  );
}
