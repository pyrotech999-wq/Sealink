/**
 * Client kill-switch for `/api/anchor/*` HTTP routes.
 * Keep in sync with `components/home/HomeLocationMap.tsx` map-presence emergency flags.
 */
const EMERGENCY_DISABLE_LIVE_MAP_APIS = true;
const EMERGENCY_REENABLE_ANCHOR_LIVE_APIS = true;

export const ANCHOR_LIVE_APIS_BLOCKED = EMERGENCY_DISABLE_LIVE_MAP_APIS && !EMERGENCY_REENABLE_ANCHOR_LIVE_APIS;
