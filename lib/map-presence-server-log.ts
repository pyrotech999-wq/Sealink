/** Vercel/server logs for presence throttling and auth (no PII in keys). */
export function logMapPresenceServer(event: string, detail?: Record<string, unknown>): void {
  const tail = detail && Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : "";
  console.info(`[map/presence] ${event}${tail}`);
}
