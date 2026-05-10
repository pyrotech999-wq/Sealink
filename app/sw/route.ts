import { NextResponse } from "next/server";

/** Served from the App Router so the worker is always in the deployment output (public/ misses are a common 404). */
const SCRIPT = `/* SeaLink — minimal installable PWA worker (pass-through fetch). */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  try {
    const u = new URL(req.url);
    if (u.pathname === "/api/anchor/commands") {
      event.respondWith(fetch(req, { cache: "no-store" }));
      return;
    }
  } catch (_) {
    /* ignore bad URL */
  }
  event.respondWith(fetch(req));
});
`;

export function GET() {
  return new NextResponse(SCRIPT, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
