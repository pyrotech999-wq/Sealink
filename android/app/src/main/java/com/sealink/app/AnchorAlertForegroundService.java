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
 * Foreground location service for Anchor Alert only. Computes drift vs anchor locally; does not
 * upload coordinates for ads or analytics.
 */
public class AnchorAlertForegroundService extends Service {

    public static final String ACTION_START = "com.sealink.app.anchor.START";
    public static final String ACTION_STOP = "com.sealink.app.anchor.STOP";
    public static final String BROADCAST_BREACH = "com.sealink.app.anchor.BREACH";

    public static final String EXTRA_ANCHOR_LAT = "anchorLat";
    public static final String EXTRA_ANCHOR_LNG = "anchorLng";
    public static final String EXTRA_RADIUS_M = "radiusM";
    public static final String EXTRA_ANGLE_DEG = "angleDeg";
    public static final String EXTRA_LAST_BEARING = "lastBearingDeg";

    private static final String TAG = "SeaLinkAnchorFGS";
    private static final String CHANNEL_ID = "sealink_anchor_alert";
    private static final int NOTIF_ID = 71001;
    private static final String PREFS = "sealink_anchor_fgs";
    private static final String PREF_LAST_ALERT_AT = "lastAlertAtMs";
    private static final String PREF_LAST_BEARING = "lastBearingDeg";

    private final LocationCallback locationCallback =
        new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                if (result == null || result.getLastLocation() == null) return;
                android.location.Location loc = result.getLastLocation();
                handleFix(loc.getLatitude(), loc.getLongitude(), loc.getAccuracy(), loc.getTime());
            }
        };

    private com.google.android.gms.location.FusedLocationProviderClient fused;
    private double anchorLat;
    private double anchorLng;
    private double radiusM;
    private int angleDeg;
    private Double lastBearingDeg;

    @Override
    public void onCreate() {
        super.onCreate();
        fused = LocationServices.getFusedLocationProviderClient(this);
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopLocationUpdates();
            stopForeground(true);
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        if (intent == null || !ACTION_START.equals(intent.getAction())) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        if (ActivityCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "start without ACCESS_FINE_LOCATION");
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        anchorLat = intent.getDoubleExtra(EXTRA_ANCHOR_LAT, 0);
        anchorLng = intent.getDoubleExtra(EXTRA_ANCHOR_LNG, 0);
        radiusM = intent.getDoubleExtra(EXTRA_RADIUS_M, 20);
        angleDeg = intent.getIntExtra(EXTRA_ANGLE_DEG, 360);
        if (intent.hasExtra(EXTRA_LAST_BEARING)) {
            double lb = intent.getDoubleExtra(EXTRA_LAST_BEARING, Double.NaN);
            lastBearingDeg = Double.isFinite(lb) ? lb : null;
        } else {
            lastBearingDeg = null;
        }

        SharedPreferences sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (lastBearingDeg == null && sp.contains(PREF_LAST_BEARING)) {
            float v = sp.getFloat(PREF_LAST_BEARING, Float.NaN);
            lastBearingDeg = Float.isFinite(v) ? (double) v : null;
        }

        Notification notification = buildPersistentNotification(getString(R.string.anchor_alert_fg_notification_text));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIF_ID, notification);
        }

        LocationRequest req =
            new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10_000L)
                .setMinUpdateIntervalMillis(5_000L)
                .setMaxUpdateDelayMillis(30_000L)
                .build();

        try {
            fused.requestLocationUpdates(req, locationCallback, getMainLooper());
        } catch (SecurityException e) {
            Log.e(TAG, "requestLocationUpdates failed", e);
            stopForeground(true);
            stopSelf(startId);
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopLocationUpdates();
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

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Anchor alert", NotificationManager.IMPORTANCE_LOW);
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

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.anchor_alert_fg_notification_title))
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    private void handleFix(double lat, double lng, float accuracyHoriz, long timeMs) {
        double distM = distanceMeters(anchorLat, anchorLng, lat, lng);
        double bearing = bearingDeg(anchorLat, anchorLng, lat, lng);
        double acc = accuracyHoriz > 0 ? accuracyHoriz : 25.0;
        double gpsBufferM = Math.max(8.0, Math.round(acc));

        SharedPreferences sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        int angleLimit = Math.max(0, Math.min(360, angleDeg));

        if (lastBearingDeg == null && Double.isFinite(bearing) && angleLimit < 360) {
            lastBearingDeg = bearing;
            sp.edit().putFloat(PREF_LAST_BEARING, (float) bearing).apply();
            return;
        }

        double angleDelta =
            lastBearingDeg != null && angleLimit < 360 ? angleDiffDeg(bearing, lastBearingDeg) : 0;

        boolean driftTriggered = distM > radiusM + gpsBufferM;
        double meaningfulDistM = Math.max(12.0, Math.round(radiusM * 0.6));
        boolean angleTriggered =
            angleLimit < 360 && distM >= meaningfulDistM && Double.isFinite(bearing) && angleDelta > angleLimit;

        if (!driftTriggered && !angleTriggered && angleLimit < 360 && Double.isFinite(bearing) && distM <= radiusM) {
            double delta = lastBearingDeg != null ? angleDiffDeg(bearing, lastBearingDeg) : 999;
            if (delta < 3) return;
            lastBearingDeg = bearing;
            sp.edit().putFloat(PREF_LAST_BEARING, (float) bearing).apply();
            return;
        }

        if (!driftTriggered && !angleTriggered) return;

        long now = System.currentTimeMillis();
        long lastAlert = sp.getLong(PREF_LAST_ALERT_AT, 0L);
        if (now - lastAlert < 2 * 60_000L) return;

        sp.edit().putLong(PREF_LAST_ALERT_AT, now).putFloat(PREF_LAST_BEARING, (float) bearing).apply();
        lastBearingDeg = bearing;

        StringBuilder parts = new StringBuilder();
        if (driftTriggered) {
            parts.append(String.format(Locale.US, "drifted ~%dm (limit %.0fm)", Math.round(distM), radiusM));
        }
        if (angleTriggered) {
            if (parts.length() > 0) parts.append(" and ");
            parts.append(String.format(Locale.US, "bearing changed ~%.0f° (limit %d°)", angleDelta, angleLimit));
        }
        String msg = "Anchor alert: " + parts + ".";

        Log.i(TAG, "breach: " + msg + " (local evaluation only; coordinates not sent for ads/analytics)");

        Intent bi = new Intent(BROADCAST_BREACH);
        bi.setPackage(getPackageName());
        bi.putExtra("message", msg);
        sendBroadcast(bi);

        Notification breach =
            new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("SeaLink — anchor alert")
                .setContentText(msg)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setOnlyAlertOnce(false)
                .build();
        NotificationManager nm = ContextCompat.getSystemService(this, NotificationManager.class);
        if (nm != null) nm.notify(NOTIF_ID + 1, breach);
    }

    /** Same distance model as web: miles * 1609.344 with WGS84 mean radius via haversine miles. */
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
