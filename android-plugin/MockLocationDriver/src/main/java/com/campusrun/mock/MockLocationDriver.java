package com.campusrun.mock;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

public final class MockLocationDriver {

    private static final String TAG = "CampusRunMock";
    private static final int REQ_LOCATION = 0x4C4F43;

    private static MockLocationDriver sInstance;
    private static Activity sActivity;

    private Context appContext;

    private MockLocationDriver(Context context) {
        appContext = context;
    }

    public static synchronized void init(Activity activity) {
        sActivity = activity;
        if (sInstance == null && activity != null) {
            sInstance = new MockLocationDriver(activity.getApplicationContext());
        }
        Log.i(TAG, "MockLocationDriver initialised");
    }

    public static synchronized MockLocationDriver getInstance() {
        if (sInstance == null && sActivity != null) {
            sInstance = new MockLocationDriver(sActivity.getApplicationContext());
        }
        return sInstance;
    }

    public String startService() {
        if (appContext == null) {
            return "not initialised";
        }

        if (!hasLocationPermission()) {
            requestLocationPermission();
            return "waiting for location permission";
        }

        Intent intent = new Intent(appContext, MockLocationService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                appContext.startForegroundService(intent);
            } else {
                appContext.startService(intent);
            }
        } catch (Throwable t) {
            Log.e(TAG, "startService failed", t);
            return "start failed: " + t;
        }

        return "service started";
    }

    public void stopService() {
        if (appContext == null) {
            return;
        }
        try {
            appContext.stopService(new Intent(appContext, MockLocationService.class));
        } catch (Throwable t) {
            Log.w(TAG, "stopService failed", t);
        }
    }

    public boolean pushFix(String envelopeJson) {
        if (envelopeJson == null || envelopeJson.length() == 0) {
            return false;
        }
        FixState state = FixState.get();
        boolean ok = state.parseEnvelope(envelopeJson);
        if (ok && !state.active) {
            state.active = true;
        }
        return ok;
    }

    public String getStatus() {
        return "running=" + MockLocationService.Running
                + " emits=" + MockLocationService.EmitCount
                + " err=" + (MockLocationService.LastError.isEmpty() ? "none" : MockLocationService.LastError);
    }

    public static String readRouteFile() {
        return FixState.ROUTE_FILE;
    }

    private boolean hasLocationPermission() {
        if (sActivity == null) {
            return true;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true;
        }
        return sActivity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void requestLocationPermission() {
        if (sActivity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }
        sActivity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                sActivity.requestPermissions(
                        new String[]{
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                        },
                        REQ_LOCATION);
            }
        });
    }
}
