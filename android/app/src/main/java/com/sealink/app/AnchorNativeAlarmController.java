package com.sealink.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.io.IOException;

/**
 * Native anchor drift alarm: looping {@link MediaPlayer}, vibration, wake lock, high-priority
 * notification. Does not depend on the WebView.
 */
public final class AnchorNativeAlarmController {

    public static final String CHANNEL_ALARM_ID = "sealink_anchor_alarm";
    private static final int NOTIF_ALARM_ID = 71003;
    private static final String WAKE_TAG = "SeaLink:AnchorNativeAlarm";

    private final Context appCtx;
    private MediaPlayer mediaPlayer;
    private PowerManager.WakeLock wakeLock;
    private boolean playing;

    public AnchorNativeAlarmController(Context context) {
        this.appCtx = context.getApplicationContext();
    }

    public boolean isPlaying() {
        return playing;
    }

    public void ensureAlarmChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ALARM_ID, "Anchor drift alarm", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("SeaLink native anchor drift alarm");
        ch.enableVibration(true);
        ch.setBypassDnd(true);
        NotificationManager nm = appCtx.getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    public void start(String message) {
        if (playing) {
            updateNotification(message);
            return;
        }
        playing = true;
        Log.i("ANCHOR_NATIVE_ALARM_PLAYING", message != null ? message : "true");

        SharedPreferences sp = AnchorAlertPrefs.prefs(appCtx);
        sp.edit().putBoolean(AnchorAlertPrefs.KEY_NATIVE_ALARM_PLAYING, true).apply();

        acquireWakeLock();
        startVibration();
        startMediaPlayer();
        postAlarmNotification(message != null ? message : "Anchor drift — check the boat");
    }

    public void stop() {
        if (!playing && mediaPlayer == null && wakeLock == null) {
            SharedPreferences sp = AnchorAlertPrefs.prefs(appCtx);
            if (sp.getBoolean(AnchorAlertPrefs.KEY_NATIVE_ALARM_PLAYING, false)) {
                sp.edit().putBoolean(AnchorAlertPrefs.KEY_NATIVE_ALARM_PLAYING, false).apply();
            }
            return;
        }
        playing = false;
        stopMediaPlayer();
        stopVibration();
        releaseWakeLock();
        SharedPreferences sp = AnchorAlertPrefs.prefs(appCtx);
        sp.edit().putBoolean(AnchorAlertPrefs.KEY_NATIVE_ALARM_PLAYING, false).apply();
        NotificationManager nm = ContextCompat.getSystemService(appCtx, NotificationManager.class);
        if (nm != null) nm.cancel(NOTIF_ALARM_ID);
    }

    private void updateNotification(String message) {
        NotificationManager nm = ContextCompat.getSystemService(appCtx, NotificationManager.class);
        if (nm == null) return;
        nm.notify(NOTIF_ALARM_ID, buildAlarmNotification(message != null ? message : "Anchor drift"));
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) appCtx.getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            releaseWakeLock();
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_TAG);
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(60 * 60 * 1000L /* max 1h */);
        } catch (Exception e) {
            Log.w("ANCHOR_NATIVE_ALARM_PLAYING", "wake lock: " + e.getMessage());
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        wakeLock = null;
    }

    private void startVibration() {
        long[] pattern = new long[] { 0, 400, 200, 400, 200, 800, 200, 400, 200, 400 };
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) appCtx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) {
                    Vibrator v = vm.getDefaultVibrator();
                    if (v != null && v.hasVibrator()) {
                        v.vibrate(VibrationEffect.createWaveform(pattern, 0));
                    }
                }
            } else {
                Vibrator v = (Vibrator) appCtx.getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createWaveform(pattern, 0));
                    } else {
                        //noinspection deprecation
                        v.vibrate(pattern, 0);
                    }
                }
            }
        } catch (Exception e) {
            Log.w("ANCHOR_NATIVE_ALARM_PLAYING", "vibrate: " + e.getMessage());
        }
    }

    private void stopVibration() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) appCtx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) {
                    Vibrator v = vm.getDefaultVibrator();
                    if (v != null) v.cancel();
                }
            } else {
                Vibrator v = (Vibrator) appCtx.getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) v.cancel();
            }
        } catch (Exception ignored) {
        }
    }

    private void startMediaPlayer() {
        stopMediaPlayer();
        try {
            Uri uri = Uri.parse("android.resource://" + appCtx.getPackageName() + "/" + R.raw.anchor_alert);
            mediaPlayer = new MediaPlayer();
            AudioAttributes attrs =
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            mediaPlayer.setAudioAttributes(attrs);
            mediaPlayer.setDataSource(appCtx, uri);
            mediaPlayer.setLooping(true);
            mediaPlayer.setVolume(1f, 1f);
            mediaPlayer.setOnPreparedListener(mp -> {
                mp.setVolume(1f, 1f);
                mp.start();
            });
            mediaPlayer.prepareAsync();
        } catch (IOException e) {
            Log.e("ANCHOR_NATIVE_ALARM_PLAYING", "MediaPlayer failed", e);
            mediaPlayer = null;
        }
    }

    private void stopMediaPlayer() {
        try {
            if (mediaPlayer != null) {
                try {
                    mediaPlayer.stop();
                } catch (Exception ignored) {
                }
                mediaPlayer.release();
            }
        } catch (Exception ignored) {
        }
        mediaPlayer = null;
    }

    private Notification buildAlarmNotification(String body) {
        Intent open = new Intent(appCtx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("sealink_open_native_anchor_alarm", true);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent fullScreen = PendingIntent.getActivity(appCtx, 2, open, piFlags);
        PendingIntent content = PendingIntent.getActivity(appCtx, 3, open, piFlags);

        NotificationCompat.Builder b =
            new NotificationCompat.Builder(appCtx, CHANNEL_ALARM_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("SEALINK — ANCHOR ALARM")
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(content)
                .setOnlyAlertOnce(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            b.setFullScreenIntent(fullScreen, true);
        }
        return b.build();
    }

    private void postAlarmNotification(String body) {
        NotificationManager nm = ContextCompat.getSystemService(appCtx, NotificationManager.class);
        if (nm != null) nm.notify(NOTIF_ALARM_ID, buildAlarmNotification(body));
    }
}
