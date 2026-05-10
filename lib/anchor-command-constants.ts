/** Queued commands older than this are marked failed (server-side, on read/list). */
export const ANCHOR_COMMAND_STALE_QUEUED_MS = 15_000;

/** If boat stays on `received` too long, fail by total command age (no separate `received_at` column). */
export const ANCHOR_COMMAND_STALE_RECEIVED_MS = 120_000;

export const ANCHOR_COMMAND_STALE_BOAT_ERROR = "Boat device offline or not responding";
