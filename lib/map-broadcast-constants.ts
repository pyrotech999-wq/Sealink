/** Keep broadcast history this many hours (server: MAP_BROADCAST_RETENTION_HOURS). */
export const MAP_BROADCAST_RETENTION_HOURS = 24;

/** Max posts per presence session per rolling hour (server-tunable later). */
export const MAP_BROADCAST_RATE_PER_HOUR = 12;

/** MOB alerts: visibility radius (statute miles). */
export const MAP_MOB_RADIUS_MI = 10;

/** Max MOB posts per user per rolling hour (abuse guard). */
export const MAP_MOB_RATE_PER_HOUR = 3;

/** Max characters for MOB broadcast body (includes contact block). */
export const MAP_MOB_BODY_MAX = 2500;

/** First line of server-built MOB cancellation broadcasts (recipient clients match on this). */
export const MOB_CANCEL_BROADCAST_INTRO =
  "✅ MOB CANCELLED — person secure / emergency no longer active";
