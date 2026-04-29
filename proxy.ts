import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";

export function proxy(request: NextRequest) {
  const hasDemo = request.cookies.get(DEMO_SESSION_COOKIE)?.value === DEMO_SESSION_VALUE;
  if (!hasDemo) {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;
  if (path === "/sign-in" || path.startsWith("/sign-in/")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/sign-in", "/sign-in/:path*"],
};
