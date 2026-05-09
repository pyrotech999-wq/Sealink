package com.sealink.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "SeaLinkAnchorAlert",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }, alias = AnchorAlertPlugin.ALIAS_BACKGROUND_LOCATION),
    }
)
public class AnchorAlertPlugin extends Plugin {

    static final String ALIAS_BACKGROUND_LOCATION = "backgroundLocation";

    private BroadcastReceiver breachReceiver;
    private BroadcastReceiver statusReceiver;
    private ActivityResultLauncher<String> postNotificationPermissionLauncher;
    private PluginCall pendingPostNotificationCall;

    private static JSObject buildStatusJson(Context ctx) {
        SharedPreferences sp = AnchorAlertPrefs.prefs(ctx);
        JSObject o = new JSObject();
        o.put("alarmActive", sp.getBoolean(AnchorAlertPrefs.KEY_ALARM_ACTIVE, false));
        o.put("anchorLat", (double) sp.getFloat(AnchorAlertPrefs.KEY_ANCHOR_LAT, Float.NaN));
        o.put("anchorLng", (double) sp.getFloat(AnchorAlertPrefs.KEY_ANCHOR_LNG, Float.NaN));
        o.put("radiusMeters", (double) sp.getFloat(AnchorAlertPrefs.KEY_RADIUS_METERS, 0f));
        o.put("testMode", sp.getBoolean(AnchorAlertPrefs.KEY_TEST_MODE, false));
        o.put("lastDistanceMeters", (double) sp.getFloat(AnchorAlertPrefs.KEY_LAST_DISTANCE_METERS, Float.NaN));
        o.put("driftAlarmPending", sp.getBoolean(AnchorAlertPrefs.KEY_DRIFT_ALARM_PENDING, false));
        o.put("nativeAlarmPlaying", sp.getBoolean(AnchorAlertPrefs.KEY_NATIVE_ALARM_PLAYING, false));
        o.put("suppressUntilInside", sp.getBoolean(AnchorAlertPrefs.KEY_SUPPRESS_UNTIL_INSIDE, false));
        String msg = sp.getString(AnchorAlertPrefs.KEY_LAST_ALARM_MESSAGE, null);
        if (msg != null) o.put("lastAlarmMessage", msg);
        o.put("lastFixLat", (double) sp.getFloat(AnchorAlertPrefs.KEY_LAST_FIX_LAT, Float.NaN));
        o.put("lastFixLng", (double) sp.getFloat(AnchorAlertPrefs.KEY_LAST_FIX_LNG, Float.NaN));
        o.put("lastFixTimeMs", sp.getLong(AnchorAlertPrefs.KEY_LAST_FIX_TIME_MS, 0L));
        return o;
    }

    @Override
    public void load() {
        super.load();
        breachReceiver =
            new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (intent == null) return;
                    String msg = intent.getStringExtra("message");
                    JSObject data = new JSObject();
                    if (msg != null) data.put("message", msg);
                    data.put("fromNative", true);
                    notifyListeners("nativeAnchorBreach", data, true);
                }
            };
        IntentFilter breachFilter = new IntentFilter(AnchorAlertForegroundService.BROADCAST_BREACH);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(breachReceiver, breachFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(breachReceiver, breachFilter);
        }

        statusReceiver =
            new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    notifyListeners("nativeAnchorStatus", buildStatusJson(context), false);
                }
            };
        IntentFilter statusFilter = new IntentFilter(AnchorAlertForegroundService.BROADCAST_STATUS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(statusReceiver, statusFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(statusReceiver, statusFilter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (breachReceiver != null) getContext().unregisterReceiver(breachReceiver);
        } catch (Exception ignored) {
        }
        breachReceiver = null;
        try {
            if (statusReceiver != null) getContext().unregisterReceiver(statusReceiver);
        } catch (Exception ignored) {
        }
        statusReceiver = null;
        super.handleOnDestroy();
    }

    private void ensurePostNotificationLauncher() {
        if (postNotificationPermissionLauncher != null) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        AppCompatActivity act = getActivity();
        if (act == null) return;
        postNotificationPermissionLauncher =
            act.registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                granted -> {
                    PluginCall pending = pendingPostNotificationCall;
                    pendingPostNotificationCall = null;
                    if (pending != null) {
                        JSObject o = new JSObject();
                        o.put("status", Boolean.TRUE.equals(granted) ? "granted" : "denied");
                        pending.resolve(o);
                    }
                }
            );
    }

    @PluginMethod
    public void requestPostNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject o = new JSObject();
            o.put("status", "unneeded");
            call.resolve(o);
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            JSObject o = new JSObject();
            o.put("status", "granted");
            call.resolve(o);
            return;
        }
        ensurePostNotificationLauncher();
        if (postNotificationPermissionLauncher == null) {
            call.reject("Activity not ready for notification permission.");
            return;
        }
        if (pendingPostNotificationCall != null) {
            call.reject("Another permission request is in progress.");
            return;
        }
        pendingPostNotificationCall = call;
        postNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
    }

    @PluginMethod
    public void requestBackgroundLocation(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            JSObject o = new JSObject();
            o.put("status", "unneeded");
            call.resolve(o);
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            call.reject("ACCESS_FINE_LOCATION must be granted before background location.");
            return;
        }
        if (getPermissionState(ALIAS_BACKGROUND_LOCATION) == PermissionState.GRANTED) {
            JSObject o = new JSObject();
            o.put("status", "granted");
            call.resolve(o);
            return;
        }
        requestPermissionForAlias(ALIAS_BACKGROUND_LOCATION, call, "onBackgroundLocationResult");
    }

    @PermissionCallback
    private void onBackgroundLocationResult(PluginCall call) {
        JSObject o = new JSObject();
        o.put("status", getPermissionState(ALIAS_BACKGROUND_LOCATION) == PermissionState.GRANTED ? "granted" : "denied");
        call.resolve(o);
    }

    @PluginMethod
    public void startMonitoring(PluginCall call) {
        Double lat = call.getDouble("anchorLat");
        Double lng = call.getDouble("anchorLng");
        Double radius = call.getDouble("radiusM");
        Integer angle = call.getInt("angleDeg", 360);
        boolean testMode = Boolean.TRUE.equals(call.getBoolean("testMode", false));

        if (lat == null || lng == null || radius == null || !Double.isFinite(lat) || !Double.isFinite(lng) || !Double.isFinite(radius)) {
            call.reject("anchorLat, anchorLng, and radiusM are required.");
            return;
        }

        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            call.reject("ACCESS_FINE_LOCATION not granted.");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                call.reject("POST_NOTIFICATIONS not granted.");
                return;
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (getPermissionState(ALIAS_BACKGROUND_LOCATION) != PermissionState.GRANTED) {
                call.reject("ACCESS_BACKGROUND_LOCATION not granted.");
                return;
            }
        }

        Intent i = new Intent(getContext(), AnchorAlertForegroundService.class);
        i.setAction(AnchorAlertForegroundService.ACTION_START);
        i.putExtra(AnchorAlertForegroundService.EXTRA_ANCHOR_LAT, lat);
        i.putExtra(AnchorAlertForegroundService.EXTRA_ANCHOR_LNG, lng);
        i.putExtra(AnchorAlertForegroundService.EXTRA_RADIUS_METERS, radius);
        i.putExtra(AnchorAlertForegroundService.EXTRA_ANGLE_DEG, angle != null ? angle : 360);
        i.putExtra(AnchorAlertForegroundService.EXTRA_TEST_MODE, testMode);
        if (call.hasOption("lastBearingDeg")) {
            Double lb = call.getDouble("lastBearingDeg");
            if (lb != null && Double.isFinite(lb)) {
                i.putExtra(AnchorAlertForegroundService.EXTRA_LAST_BEARING, lb);
            }
        }

        ContextCompat.startForegroundService(getContext(), i);
        call.resolve();
    }

    @PluginMethod
    public void stopMonitoring(PluginCall call) {
        AnchorAlertForegroundService.clearDriftDismissFromUser(getContext());
        getContext().stopService(new Intent(getContext(), AnchorAlertForegroundService.class));
        call.resolve();
    }

    @PluginMethod
    public void getNativeAnchorStatus(PluginCall call) {
        call.resolve(buildStatusJson(getContext()));
    }

    @PluginMethod
    public void clearNativeDriftAlarm(PluginCall call) {
        AnchorAlertForegroundService.clearDriftDismissFromUser(getContext());
        Intent i = new Intent(getContext(), AnchorAlertForegroundService.class);
        i.setAction(AnchorAlertForegroundService.ACTION_CLEAR_DRIFT);
        try {
            getContext().startService(i);
        } catch (Exception ignored) {
        }
        call.resolve(buildStatusJson(getContext()));
    }

    @PluginMethod
    public void setTestMode(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        AnchorAlertPrefs.prefs(getContext()).edit().putBoolean(AnchorAlertPrefs.KEY_TEST_MODE, enabled).apply();
        notifyListeners("nativeAnchorStatus", buildStatusJson(getContext()), false);
        call.resolve();
    }

    @PluginMethod
    public void getMonitoringPermissionStatus(PluginCall call) {
        JSObject o = new JSObject();
        o.put("fineLocation", ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            o.put(
                "postNotifications",
                ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            );
        } else {
            o.put("postNotifications", true);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            o.put(
                "backgroundLocation",
                getPermissionState(ALIAS_BACKGROUND_LOCATION) == PermissionState.GRANTED
            );
        } else {
            o.put("backgroundLocation", true);
        }
        call.resolve(o);
    }
}
