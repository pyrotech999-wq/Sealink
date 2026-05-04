import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;

  if (
    p.startsWith("/_next/static") ||
    p.startsWith("/_next/image") ||
    p === "/favicon.ico" ||
    p === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  return new NextResponse("SeaLink temporarily offline for maintenance.", {
    status: 503,
    headers: {
      "content-type": "text/plain",
      "cache-control": "no-store",
    },
  });
}

export const config = {
  matcher: "/:path*",
};
