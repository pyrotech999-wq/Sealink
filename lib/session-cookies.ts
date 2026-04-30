/**
 * Optional Domain= for cookies. If mis-set (e.g. includes https://), browsers **drop the entire Set-Cookie**
 * and the user will never stay signed in.
 */
function cookieDomain(): string | undefined {
  let raw = process.env.COOKIE_DOMAIN?.trim();
  if (!raw) return undefined;

  raw = raw.replace(/^https?:\/\//i, "");
  const host = raw.split("/")[0]?.split(":")[0]?.trim().toLowerCase() ?? "";
  if (!host) {
    console.warn("[session-cookies] COOKIE_DOMAIN is empty after stripping; ignoring.");
    return undefined;
  }
  if (host === "localhost" || host.endsWith(".localhost")) return undefined;

  // IP addresses cannot use Domain=
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return undefined;

  if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host) && !/^[a-z0-9-]+$/i.test(host)) {
    console.warn("[session-cookies] COOKIE_DOMAIN does not look like a hostname; ignoring:", process.env.COOKIE_DOMAIN);
    return undefined;
  }

  if (host.startsWith("www.")) {
    console.warn(
      "[session-cookies] COOKIE_DOMAIN is www-only; visits to the naked apex may not receive cookies. Prefer the bare domain (e.g. sealinkapp.com).",
    );
  }

  if (host.startsWith(".")) return host;
  return `.${host.replace(/^\.+/, "")}`;
}

export function sessionCookieBase(): {
  path: string;
  sameSite: "lax";
  httpOnly: true;
  secure: boolean;
  domain?: string;
} {
  const domain = cookieDomain();
  return {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    ...(domain ? { domain } : {}),
  };
}
