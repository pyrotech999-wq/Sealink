/** Aggressive W3C Geolocation options for an initial “GPS lock” phase in the browser. */
export const GPS_REFINE_WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 2000,
  maximumAge: 0,
};

/** Stop refinement when horizontal accuracy is at or below this (metres), or when {@link GPS_REFINE_MAX_MS} elapses. */
export const GPS_REFINE_TARGET_ACCURACY_M = 10;

/** Maximum time to keep requesting fresh high-accuracy fixes before falling back to normal tracking. */
export const GPS_REFINE_MAX_MS = 30_000;
