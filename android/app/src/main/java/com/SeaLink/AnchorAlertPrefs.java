package com.SeaLink;

import android.content.Context;
import android.content.SharedPreferences;

/** SharedPreferences for native anchor service + plugin status reads (same file). */
public final class AnchorAlertPrefs {

    public static final String FILE = "sealink_anchor_fgs";

    public static final String KEY_ANCHOR_LAT = "anchorLat";
    public static final String KEY_ANCHOR_LNG = "anchorLng";
    public static final String KEY_RADIUS_METERS = "radiusMeters";
    public static final String KEY_ALARM_ACTIVE = "alarmActive";
    public static final String KEY_TEST_MODE = "testMode";
    public static final String KEY_LAST_DISTANCE_METERS = "lastDistanceMeters";
    public static final String KEY_LAST_FIX_LAT = "lastFixLat";
    public static final String KEY_LAST_FIX_LNG = "lastFixLng";
    public static final String KEY_LAST_FIX_TIME_MS = "lastFixTimeMs";
    public static final String KEY_DRIFT_ALARM_PENDING = "driftAlarmPending";
    public static final String KEY_NATIVE_ALARM_PLAYING = "nativeAlarmPlaying";
    public static final String KEY_LAST_ALARM_MESSAGE = "lastAlarmMessage";
    public static final String KEY_SUPPRESS_UNTIL_INSIDE = "suppressUntilInside";
    public static final String KEY_ANGLE_DEG = "angleDeg";
    public static final String KEY_LAST_BEARING_DEG = "lastBearingDeg";

    private AnchorAlertPrefs() {}

    public static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }
}
