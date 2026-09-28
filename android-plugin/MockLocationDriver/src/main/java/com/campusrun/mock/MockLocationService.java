package com.campusrun.mock;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Criteria;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

public class MockLocationService extends Service {

    private static final String TAG = "CampusRunMock";
    private static final String CHANNEL_ID = "campusrun_mock";
    private static final int NOTIFICATION_ID = 0x43524D31;

    private static final long POLL_MS = 200L;
    private static final long MIN_EMIT_INTERVAL_MS = 900L;
    private static final long RESEND_AFTER_MS = 3000L;
    private static final long ROUTE_FILE_INTERVAL_MS = 1000L;

    public static volatile boolean Running = false;
    public static volatile String LastError = "";
    public static volatile long EmitCount = 0L;

    private LocationManager locationManager;
    private Handler handler;
    private boolean providerReady;
    private long lastSeq = Long.MIN_VALUE;
    private long lastEmitMs;
    private long lastRouteWriteMs;
    private int lastSatellites = -1;

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundInternal();
        if (!Running) {
            Running = true;
            lastSeq = Long.MIN_VALUE;
            handler.removeCallbacks(tickRunnable);
            handler.post(tickRunnable);
            Log.i(TAG, "mock location loop started");
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        Running = false;
        handler.removeCallbacks(tickRunnable);
        teardownProvider();
        Log.i(TAG, "mock location loop stopped");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startForegroundInternal() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "CampusRun Mock Location", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Keeps the virtual GPS feed alive while the game runs");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }

        Intent open = new Intent(this, MockLocationService.class);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getService(this, 0, open, piFlags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        Notification n = builder
                .setContentTitle("CampusRun 虚拟 GPS 运行中")
                .setContentText("游戏里的位移正在写入系统定位")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();

        startForeground(NOTIFICATION_ID, n);
    }

    private final Runnable tickRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                tick();
            } catch (Throwable t) {
                LastError = String.valueOf(t);
                Log.w(TAG, "tick failed", t);
            }
            handler.postDelayed(this, POLL_MS);
        }
    };

    private void tick() {
        FixState state = FixState.get();

        if (!state.active) {
            return;
        }

        if (!ensureProvider()) {
            return;
        }

        long now = System.currentTimeMillis();
        boolean fresh = state.seq != lastSeq;

        if (fresh) {
            lastSeq = state.seq;
        }

        boolean dueForFresh = fresh && (now - lastEmitMs) >= MIN_EMIT_INTERVAL_MS;
        boolean dueForResend = !fresh && (now - lastEmitMs) >= RESEND_AFTER_MS;

        if (!dueForFresh && !dueForResend) {
            writeRouteFileThrottled(state, now);
            return;
        }

        Location loc = state.toLocation();

        try {
            locationManager.setTestProviderLocation(LocationManager.GPS_PROVIDER, loc);
            lastEmitMs = now;
            EmitCount++;
            pushSatelliteStatus(state, now);
            LastError = "";
        } catch (Throwable t) {
            LastError = String.valueOf(t);
            Log.w(TAG, "setTestProviderLocation failed", t);
        }

        writeRouteFileThrottled(state, now);
    }

    private void pushSatelliteStatus(FixState state, long now) {
        if (state.satellites == lastSatellites) {
            return;
        }
        lastSatellites = state.satellites;
        try {
            Bundle b = new Bundle();
            b.putInt("satellites", state.satellites);
            locationManager.setTestProviderStatus(
                    LocationManager.GPS_PROVIDER, 2, b, now);
        } catch (Throwable ignored) {
        }
    }

    private void writeRouteFileThrottled(FixState state, long now) {
        if (now - lastRouteWriteMs < ROUTE_FILE_INTERVAL_MS) {
            return;
        }
        lastRouteWriteMs = now;
        state.writeRouteFile();
    }

    private boolean ensureProvider() {
        if (providerReady) {
            return true;
        }

        try {
            locationManager.addTestProvider(
                    LocationManager.GPS_PROVIDER,
                    false, false, false, false,
                    true, true, true,
                    Criteria.POWER_LOW, Criteria.ACCURACY_FINE);
        } catch (IllegalArgumentException alreadyThere) {
            Log.i(TAG, "gps test provider already registered, reusing");
        } catch (Throwable t) {
            LastError = "addTestProvider: " + t;
            Log.e(TAG, "addTestProvider denied. Enable developer options and pick this app "
                    + "in 'Select mock location app'.", t);
            return false;
        }

        try {
            locationManager.setTestProviderEnabled(LocationManager.GPS_PROVIDER, true);
        } catch (Throwable t) {
            LastError = "setTestProviderEnabled: " + t;
            Log.w(TAG, "setTestProviderEnabled failed", t);
        }

        providerReady = true;
        return true;
    }

    private void teardownProvider() {
        if (!providerReady) {
            return;
        }
        try {
            locationManager.setTestProviderEnabled(LocationManager.GPS_PROVIDER, false);
        } catch (Throwable ignored) {
        }
        try {
            locationManager.removeTestProvider(LocationManager.GPS_PROVIDER);
        } catch (Throwable ignored) {
        }
        providerReady = false;
    }
}
