import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname

  // Allow Next.js internals
  if (
    p.startsWith('/_next') ||
    p === '/favicon.ico' ||
    p === '/robots.txt'
  ) {
    return NextResponse.next()
  }

  // 🚫 Block obvious bot probes
  if (
    p.startsWith('/wp-admin') ||
    p.startsWith('/wp-login.php') ||
    p.startsWith('/xmlrpc.php')
  ) {
    return new NextResponse('Blocked', { status: 403 })
  }

  // ✅ Allow everything else
  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}