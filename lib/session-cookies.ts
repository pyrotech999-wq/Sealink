function cookieDomain(): string | undefined {
  const raw = process.env.COOKIE_DOMAIN?.trim();
  if (!raw) return undefined;
  // Allow either ".example.com" or "example.com" — browsers expect leading dot for subdomain sharing.
  if (raw.startsWith(".")) return raw;
  return `.${raw.replace(/^\.+/, "")}`;
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
