import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";
import { safeInternalPathFromNextParam } from "@/lib/safe-internal-next-path";

function isNextInternalOrAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw"
  );
}

function isObviousBotProbe(pathname: string): boolean {
  return (
    pathname.startsWith("/wp-admin") ||
    pathname.startsWith("/wp-login.php") ||
    pathname.startsWith("/xmlrpc.php")
  );
}

/**
 * Unauthenticated users may only hit auth pages, account-deletion URLs, legal pages
 * (needed for sign-up checkboxes), and selected API routes (auth, session probe, Stripe webhooks).
 */
function isExemptFromSessionGate(pathname: string): boolean {
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/api/stripe/webhook") return true;
  if (pathname === "/api/demo/me") return true;
  if (pathname === "/api/demo/sign-in" || pathname === "/api/demo/sign-out") return true;
  /** Public rotating sponsor banners (bottom dock); must work without session cookies. */
  if (pathname === "/api/site-banner-ads") return true;
  // Public chart proxies (used by <img> tags on /weather).
  if (pathname === "/api/weather/opc-chart") return true;
  if (pathname === "/api/weather/metoffice-surface-pressure") return true;

  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname === "/manifest.webmanifest" || pathname === "/sw") return true;

  const exempt = [
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
    "/delete-data",
    "/delete-account",
    "/delete-my-data",
    "/terms",
    "/privacy",
  ];
  for (const p of exempt) {
    if (pathname === p || pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

/** Paths reachable without an active plan (trial/subscription) or admin-granted access. */
function isExemptFromPlanGate(pathname: string): boolean {
  if (pathname.startsWith("/api")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname === "/manifest.webmanifest" || pathname === "/sw") return true;
  const exempt = [
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
    "/payment",
    "/privacy",
    "/terms",
    "/help",
    "/delete-data",
    "/delete-account",
    "/delete-my-data",
  ];
  for (const p of exempt) {
    if (pathname === p || pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (isNextInternalOrAsset(path)) return NextResponse.next();
  if (isObviousBotProbe(path)) return new NextResponse("Blocked", { status: 403 });

  const hasSession = request.cookies.get(DEMO_SESSION_COOKIE)?.value === DEMO_SESSION_VALUE;

  if (hasSession && (path === "/sign-in" || path.startsWith("/sign-in/"))) {
    const next = request.nextUrl.searchParams.get("next");
    const target = safeInternalPathFromNextParam(next);
    return NextResponse.redirect(new URL(target, request.url));
  }

  if (!hasSession && !isExemptFromSessionGate(path)) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(url, 302);
  }

  if (!hasSession || isExemptFromPlanGate(path)) {
    return NextResponse.next();
  }

  // Only enforce plan gate on full document navigations.
  // This avoids duplicate `/api/me/subscription` checks during initial load (RSC/data fetches, prefetches, etc.).
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/html")) {
    return NextResponse.next();
  }

  const origin = request.nextUrl.origin;
  const cookie = request.headers.get("cookie") ?? "";
  try {
    const res = await fetch(`${origin}/api/me/subscription`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (res.status === 401) return NextResponse.next();
    if (!res.ok) return NextResponse.next();
    const data = (await res.json()) as { hasAccess?: boolean };
    if (data.hasAccess === true) return NextResponse.next();
  } catch {
    return NextResponse.next();
  }

  const dest = new URL("/payment", request.url);
  dest.searchParams.set("required", "1");
  return NextResponse.redirect(dest);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
