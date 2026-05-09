package com.sealink.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import java.util.Locale;

/**
 * Native anchor drift loop: reads anchor + radius from prefs, evaluates each fused location update,
 * triggers native alarm (sound + vibration + wake lock + notification) without the WebView.
 */
public class AnchorAlertForegroundService extends Service {

    public static final String ACTION_START = "com.sealink.app.anchor.START";
    public static final String ACTION_STOP = "com.sealink.app.anchor.STOP";
    public static final String ACTION_CLEAR_DRIFT = "com.sealink.app.anchor.CLEAR_DRIFT";
    public static final String BROADCAST_BREACH = "com.sealink.app.anchor.BREACH";
    public static final String BROADCAST_STATUS = "com.sealink.app.anchor.STATUS";

    public static final String EXTRA_ANCHOR_LAT = "anchorLat";
    public static final String EXTRA_ANCHOR_LNG = "anchorLng";
    public static final String EXTRA_RADIUS_METERS = "radiusMeters";
    public static final String EXTRA_ANGLE_DEG = "angleDeg";
    public static final String EXTRA_LAST_BEARING = "lastBearingDeg";
    public static final String EXTRA_TEST_MODE = "testMode";

    private static final String CHANNEL_FG_ID = "sealink_anchor_alert";
    private static final int NOTIF_ID = 71001;

    private static volatile AnchorAlertForegroundService runningInstance;

    private com.google.android.gms.location.FusedLocationProviderClient fused;
    private final AnchorNativeAlarmController alarmController = new AnchorNativeAlarmController(this);
    private Double lastBearingRuntime;

    private final LocationCallback locationCallback =
        new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                if (result == null || result.getLastLocation() == null) return;
                android.location.Location loc = result.getLastLocation();
                handleLocationUpdate(loc.getLatitude(), loc.getLongitude(), loc.getAccuracy(), loc.getTime());
            }
        };

    /** Called from plugin when user dismisses alarm in Web UI. */
    public static void clearDriftDismissFromUser(Context context) {
        SharedPreferences sp = AnchorAlertPrefs.prefs(context);
        sp.edit()
            .putBoolean(AnchorAlertPrefs.KEY_DRIFT_ALARM_PENDING, false)
            .putBoolean(AnchorAlertPrefs.KEY_SUPPRESS_UNTIL_INSIDE, true)
            .putBoolean(AnchorAlertPrefs.KEY_NATIVE_ALARM_PLAYING, false)
            .apply();
        AnchorNativeAlarmController tmp = new AnchorNativeAlarmController(context);
        tmp.stop();
        AnchorAlertForegroundService inst = runningInstance;
        if (inst != null) inst.alarmController.stop();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        runningInstance = this;
        fused = LocationServices.getFusedLocationProviderClient(this);
        createForegroundChannel();
        alarmController.ensureAlarmChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_CLEAR_DRIFT.equals(intent.getAction())) {
            alarmController.stop();
            SharedPreferences sp = AnchorAlertPrefs.prefs(this);
            sp.edit()
                .putBoolean(AnchorAlertPrefs.KEY_DRIFT_ALARM_PENDING, false)
                .putBoolean(AnchorAlertPrefs.KEY_SUPPRESS_UNTIL_INSIDE, true)
                .putBoolean(AnchorAlertPrefs.KEY_NATIVE_ALARM_PLAYING, false)
                .apply();
            sendStatusBroadcast();
            return START_STICKY;
        }

        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            shutdownMonitoring();
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        if (intent == null || !ACTION_START.equals(intent.getAction())) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        stopLocationUpdates();

        if (ActivityCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w("ANCHOR_SERVICE_LOCATION_UPDATE", "missing ACCESS_FINE_LOCATION");
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        double lat = intent.getDoubleExtra(EXTRA_ANCHOR_LAT, Double.NaN);
        double lng = intent.getDoubleExtra(EXTRA_ANCHOR_LNG, Double.NaN);
        double radiusM = intent.getDoubleExtra(EXTRA_RADIUS_METERS, 20);
        int angle = intent.getIntExtra(EXTRA_ANGLE_DEG, 360);
        boolean testMode = intent.getBooleanExtra(EXTRA_TEST_MODE, false);
        Double lastBearing = null;
        if (intent.hasExtra(EXTRA_LAST_BEARING)) {
            double lb = intent.getDoubleExtra(EXTRA_LAST_BEARING, Double.NaN);
            if (Double.isFinite(lb)) lastBearing = lb;
        }

        SharedPreferences sp = AnchorAlertPrefs.prefs(this);
        SharedPreferences.Editor ed =
            sp.edit()
                .putFloat(AnchorAlertPrefs.KEY_ANCHOR_LAT, (float) lat)
                .putFloat(AnchorAlertPrefs.KEY_ANCHOR_LNG, (float) lng)
                .putFloat(AnchorAlertPrefs.KEY_RADIUS_METERS, (float) radiusM)
                .putBoolean(AnchorAlertPrefs.KEY_ALARM_ACTIVE, true)
                .putBoolean(AnchorAlertPrefs.KEY_TEST_MODE, testMode)
                .putInt(AnchorAlertPrefs.KEY_ANGLE_DEG, angle)
                .putBoolean(AnchorAlertPrefs.KEY_DRIFT_ALARM_PENDING, false)
                .putBoolean(AnchorAlertPrefs.KEY_NATIVE_ALARM_PLAYING, false)
                .putBoolean(AnchorAlertPrefs.KEY_SUPPRESS_UNTIL_INSIDE, false);
        if (lastBearing != null) {
            ed.putFloat(AnchorAlertPrefs.KEY_LAST_BEARING_DEG, lastBearing.floatValue());
            lastBearingRuntime = lastBearing;
        } else {
            ed.remove(AnchorAlertPrefs.KEY_LAST_BEARING_DEG);
            lastBearingRuntime = null;
            if (sp.contains(AnchorAlertPrefs.KEY_LAST_BEARING_DEG)) {
                float v = sp.getFloat(AnchorAlertPrefs.KEY_LAST_BEARING_DEG, Float.NaN);
                lastBearingRuntime = Float.isFinite(v) ? (double) v : null;
            }
        }
        ed.apply();

        Notification notification = buildPersistentNotification(getString(R.string.anchor_alert_fg_notification_text));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIF_ID, notification);
        }

        LocationRequest req =
            new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5_000L)
                .setMinUpdateIntervalMillis(2_000L)
                .setMaxUpdateDelayMillis(20_000L)
                .build();

        try {
            fused.requestLocationUpdates(req, locationCallback, getMainLooper());
        } catch (SecurityException e) {
            Log.e("ANCHOR_SERVICE_LOCATION_UPDATE", "requestLocationUpdates failed", e);
            shutdownMonitoring();
            stopSelf(startId);
        }

        return START_STICKY;
    }

    private void shutdownMonitoring() {
        stopLocationUpdates();
        alarmController.stop();
        SharedPreferences sp = AnchorAlertPrefs.prefs(this);
        sp.edit().putBoolean(AnchorAlertPrefs.KEY_ALARM_ACTIVE, false).putBoolean(AnchorAlertPrefs.KEY_DRIFT_ALARM_PENDING, false).apply();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            //noinspection deprecation
            stopForeground(true);
        }
    }

    @Override
    public void onDestroy() {
        stopLocationUpdates();
        alarmController.stop();
        runningInstance = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            //noinspection deprecation
            stopForeground(true);
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void stopLocationUpdates() {
        try {
            fused.removeLocationUpdates(locationCallback);
        } catch (Exception ignored) {
        }
    }

    private void createForegroundChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_FG_ID, "Anchor alert", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("SeaLink anchor safety monitoring");
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    private Notification buildPersistentNotification(String body) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi =
            PendingIntent.getActivity(
                this,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

        return new NotificationCompat.Builder(this, CHANNEL_FG_ID)
            .setContentTitle(getString(R.string.anchor_alert_fg_notification_title))
            .setContentText(body)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    private void handleLocationUpdate(double lat, double lng, float accuracyHoriz, long timeMs) {
        SharedPreferences sp = AnchorAlertPrefs.prefs(this);
        if (!sp.getBoolean(AnchorAlertPrefs.KEY_ALARM_ACTIVE, false)) return;

        float aLat = sp.getFloat(AnchorAlertPrefs.KEY_ANCHOR_LAT, Float.NaN);
        float aLng = sp.getFloat(AnchorAlertPrefs.KEY_ANCHOR_LNG, Float.NaN);
        if (!Float.isFinite(aLat) || !Float.isFinite(aLng)) return;

        boolean testMode = sp.getBoolean(AnchorAlertPrefs.KEY_TEST_MODE, false);
        double radiusConfigured = sp.getFloat(AnchorAlertPrefs.KEY_RADIUS_METERS, 20f);
        double effectiveRadiusM = testMode ? 5.0 : radiusConfigured;

        int angleDeg = sp.getInt(AnchorAlertPrefs.KEY_ANGLE_DEG, 360);
        double distM = distanceMeters(aLat, aLng, lat, lng);
        double bearing = bearingDeg(aLat, aLng, lat, lng);
        double acc = accuracyHoriz > 0 ? accuracyHoriz : 25.0;

        Log.i(
            "ANCHOR_SERVICE_LOCATION_UPDATE",
            String.format(Locale.US, "lat=%.6f lng=%.6f acc=%.1f t=%d", lat, lng, acc, timeMs)
        );
        Log.i("ANCHOR_DISTANCE_METERS", String.format(Locale.US, "%.2f (effectiveRadius=%.1f testMode=%s)", distM, effectiveRadiusM, testMode));

        sp.edit()
            .putFloat(AnchorAlertPrefs.KEY_LAST_DISTANCE_METERS, (float) distM)
            .putFloat(AnchorAlertPrefs.KEY_LAST_FIX_LAT, (float) lat)
            .putFloat(AnchorAlertPrefs.KEY_LAST_FIX_LNG, (float) lng)
            .putLong(AnchorAlertPrefs.KEY_LAST_FIX_TIME_MS, timeMs)
            .apply();

        sendStatusBroadcast();

        boolean suppress = sp.getBoolean(AnchorAlertPrefs.KEY_SUPPRESS_UNTIL_INSIDE, false);
        if (suppress && distM <= effectiveRadiusM) {
            sp.edit().putBoolean(AnchorAlertPrefs.KEY_SUPPRESS_UNTIL_INSIDE, false).apply();
            suppress = false;
        }
        if (suppress && distM > effectiveRadiusM) {
            return;
        }

        int angleLimit = Math.max(0, Math.min(360, angleDeg));
        if (lastBearingRuntime == null && Float.isFinite((float) bearing) && angleLimit < 360) {
            lastBearingRuntime = bearing;
            sp.edit().putFloat(AnchorAlertPrefs.KEY_LAST_BEARING_DEG, (float) bearing).apply();
            return;
        }

        double angleDelta =
            lastBearingRuntime != null && angleLimit < 360 ? angleDiffDeg(bearing, lastBearingRuntime) : 0;

        boolean driftDistance = distM > effectiveRadiusM;
        double meaningfulDistM = Math.max(12.0, Math.round(effectiveRadiusM * 0.6));
        boolean angleTriggered =
            angleLimit < 360 && distM >= meaningfulDistM && Double.isFinite(bearing) && angleDelta > angleLimit;

        if (!driftDistance && !angleTriggered && angleLimit < 360 && Double.isFinite(bearing) && distM <= effectiveRadiusM) {
            double delta = lastBearingRuntime != null ? angleDiffDeg(bearing, lastBearingRuntime) : 999;
            if (delta < 3) return;
            lastBearingRuntime = bearing;
            sp.edit().putFloat(AnchorAlertPrefs.KEY_LAST_BEARING_DEG, (float) bearing).apply();
            return;
        }

        if (driftDistance || angleTriggered) {
            if (sp.getBoolean(AnchorAlertPrefs.KEY_DRIFT_ALARM_PENDING, false) && alarmController.isPlaying()) {
                return;
            }
            triggerDriftAlarm(sp, driftDistance, angleTriggered, distM, effectiveRadiusM, angleDelta, angleLimit, bearing);
        } else {
            if (sp.getBoolean(AnchorAlertPrefs.KEY_DRIFT_ALARM_PENDING, false) || alarmController.isPlaying()) {
                lastBearingRuntime = bearing;
                sp.edit()
                    .putFloat(AnchorAlertPrefs.KEY_LAST_BEARING_DEG, (float) bearing)
                    .putBoolean(AnchorAlertPrefs.KEY_DRIFT_ALARM_PENDING, false)
                    .apply();
                alarmController.stop();
                sendStatusBroadcast();
            }
        }
    }

    private void triggerDriftAlarm(
        SharedPreferences sp,
        boolean driftDistance,
        boolean angleTriggered,
        double distM,
        double effectiveRadiusM,
        double angleDelta,
        int angleLimit,
        double bearing
    ) {
        StringBuilder parts = new StringBuilder();
        if (driftDistance) {
            parts.append(String.format(Locale.US, "drifted ~%dm (limit %.0fm)", Math.round(distM), effectiveRadiusM));
        }
        if (angleTriggered) {
            if (parts.length() > 0) parts.append(" and ");
            parts.append(String.format(Locale.US, "bearing changed ~%.0f° (limit %d°)", angleDelta, angleLimit));
        }
        String msg = "Anchor alert: " + parts + ".";

        Log.i("ANCHOR_DRIFT_DETECTED", msg);
        lastBearingRuntime = bearing;
        sp.edit()
            .putBoolean(AnchorAlertPrefs.KEY_DRIFT_ALARM_PENDING, true)
            .putString(AnchorAlertPrefs.KEY_LAST_ALARM_MESSAGE, msg)
            .putFloat(AnchorAlertPrefs.KEY_LAST_BEARING_DEG, (float) bearing)
            .apply();

        Intent bi = new Intent(BROADCAST_BREACH);
        bi.setPackage(getPackageName());
        bi.putExtra("message", msg);
        sendBroadcast(bi);

        alarmController.start(msg);
        sendStatusBroadcast();
    }

    private void sendStatusBroadcast() {
        Intent i = new Intent(BROADCAST_STATUS);
        i.setPackage(getPackageName());
        sendBroadcast(i);
    }

    private static double distanceMeters(double lat1, double lon1, double lat2, double lon2) {
        return distanceMiles(lat1, lon1, lat2, lon2) * 1609.344;
    }

    private static double distanceMiles(double lat1, double lon1, double lat2, double lon2) {
        final double R = 3958.8;
        double r1 = Math.toRadians(lat1);
        double r2 = Math.toRadians(lat2);
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(r1) * Math.cos(r2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private static double bearingDeg(double lat1, double lon1, double lat2, double lon2) {
        double r1 = Math.toRadians(lat1);
        double r2 = Math.toRadians(lat2);
        double dLon = Math.toRadians(lon2 - lon1);
        double y = Math.sin(dLon) * Math.cos(r2);
        double x = Math.cos(r1) * Math.sin(r2) - Math.sin(r1) * Math.cos(r2) * Math.cos(dLon);
        double brng = Math.toDegrees(Math.atan2(y, x));
        return (brng + 360) % 360;
    }

    private static double angleDiffDeg(double a, double b) {
        return Math.abs(((a - b + 540) % 360) - 180);
    }
}
