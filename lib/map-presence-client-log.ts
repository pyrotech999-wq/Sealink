/** Short browser logs for presence throttling / auth skips (see also server logs in `app/api/map/presence/route.ts`). */
export function logMapPresenceClient(event: string, detail?: Record<string, unknown>): void {
  const tail = detail && Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : "";
  console.info(`[map/presence:client] ${event}${tail}`);
}
