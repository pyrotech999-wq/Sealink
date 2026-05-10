/**
 * Client kill-switch for `/api/anchor/*` HTTP routes (geofence, monitor, commands, alerts, devices).
 *
 * **Live / production:** leave `NEXT_PUBLIC_ANCHOR_LIVE_APIS_DISABLED` unset (anchor + remote commands work).
 * Set `NEXT_PUBLIC_ANCHOR_LIVE_APIS_DISABLED=1` on Vercel (or `.env.local`) to disable all anchor client fetches
 * without a code change — redeploy after toggling so the bundle picks up the new value.
 */
export const ANCHOR_LIVE_APIS_BLOCKED =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_ANCHOR_LIVE_APIS_DISABLED === "1";
