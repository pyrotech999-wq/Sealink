/** How far out to show other opted-in sharers (miles). Server: override with MAP_NEARBY_RADIUS_MI. */
export const MAP_NEARBY_RADIUS_MI = 5;

/** Drop presence if no heartbeat for this long (seconds). Server: MAP_PRESENCE_STALE_SEC. */
export const MAP_PRESENCE_STALE_SEC = 120;

export const MAP_PRESENCE_COOKIE = "sealink_map_presence";

export const MAP_PRESENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
