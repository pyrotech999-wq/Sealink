import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";

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
  ];
  for (const p of exempt) {
    if (pathname === p || pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const hasSession = request.cookies.get(DEMO_SESSION_COOKIE)?.value === DEMO_SESSION_VALUE;

  if (hasSession && (path === "/sign-in" || path.startsWith("/sign-in/"))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  /** Plans/checkout require an account first; success return URLs stay under `/payment/success`. */
  if (!hasSession && path === "/payment") {
    return NextResponse.redirect(new URL("/sign-up", request.url));
  }

  if (!hasSession || isExemptFromPlanGate(path)) {
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
