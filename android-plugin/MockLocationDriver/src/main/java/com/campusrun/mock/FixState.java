package com.campusrun.mock;

import android.location.Location;
import android.location.LocationManager;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

public final class FixState {

    private static final String TAG = "CampusRunMock";

    public static final String ROUTE_FILE = "/data/local/tmp/lpr_route.json";
    public static final String ROUTE_FILE_TMP = "/data/local/tmp/.lpr_route.json.tmp";

    public volatile boolean active;
    public volatile boolean running;
    public volatile long seq;
    public volatile double lat;
    public volatile double lon;
    public volatile long timeMs;
    public volatile long elapsedRealtimeNanos;
    public volatile float accuracy;
    public volatile float speed;
    public volatile float bearing;
    public volatile double altitude;
    public volatile int satellites;
    public volatile double distanceMeters;
    public volatile double durationSeconds;
    public volatile long receivedAtMs;

    private static FixState sInstance;

    public static synchronized FixState get() {
        if (sInstance == null) {
            sInstance = new FixState();
        }
        return sInstance;
    }

    private FixState() {
        active = false;
        running = false;
        accuracy = 10f;
        speed = 0f;
        bearing = 0f;
        altitude = 0d;
        satellites = 8;
    }

    public boolean parseEnvelope(String json) {
        try {
            JSONObject root = new JSONObject(json);
            JSONObject fix = root.getJSONObject("fix");

            lat = fix.getDouble("lat");
            lon = fix.getDouble("lon");
            timeMs = fix.optLong("timeMs", System.currentTimeMillis());
            elapsedRealtimeNanos = fix.optLong("elapsedRealtimeNanos", 0L);
            accuracy = (float) fix.optDouble("accuracy", 10d);
            speed = (float) fix.optDouble("speed", 0d);
            bearing = (float) fix.optDouble("bearing", 0d);
            altitude = fix.optDouble("altitude", 0d);
            satellites = fix.optInt("satellites", 8);

            seq = root.optLong("seq", seq + 1);
            active = root.optBoolean("active", true);
            running = root.optBoolean("running", true);
            distanceMeters = root.optDouble("distanceMeters", 0d);
            durationSeconds = root.optDouble("durationSeconds", 0d);
            receivedAtMs = System.currentTimeMillis();
            return true;
        } catch (Throwable t) {
            Log.w(TAG, "parseEnvelope failed: " + t);
            return false;
        }
    }

    public Location toLocation() {
        Location loc = new Location(LocationManager.GPS_PROVIDER);

        loc.setLatitude(lat);
        loc.setLongitude(lon);

        long nowWall = System.currentTimeMillis();
        long stamp = timeMs;
        if (stamp <= 0L || Math.abs(nowWall - stamp) > 5000L) {
            stamp = nowWall;
        }
        loc.setTime(stamp);
        loc.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());

        loc.setAccuracy(accuracy > 0f ? accuracy : 10f);
        loc.setSpeed(speed >= 0f ? speed : 0f);
        loc.setBearing(bearing >= 0f ? bearing : 0f);
        loc.setAltitude(altitude);

        android.os.Bundle extras = new android.os.Bundle();
        extras.putInt("satellites", satellites);
        extras.putInt("satelliteCount", satellites);
        extras.putDouble("meanCn0", 28.0d);
        loc.setExtras(extras);

        return loc;
    }

    public void writeRouteFile() {
        String payload;
        try {
            JSONObject root = new JSONObject();
            root.put("v", 1);
            root.put("seq", seq);
            root.put("active", active);
            root.put("running", running);
            root.put("distanceMeters", distanceMeters);
            root.put("durationSeconds", durationSeconds);
            root.put("updatedAtMs", System.currentTimeMillis());
            root.put("source", "campusrun-unity");

            JSONObject fix = new JSONObject();
            fix.put("lat", lat);
            fix.put("lon", lon);
            fix.put("timeMs", timeMs);
            fix.put("elapsedRealtimeNanos", elapsedRealtimeNanos);
            fix.put("accuracy", accuracy);
            fix.put("speed", speed);
            fix.put("bearing", bearing);
            fix.put("altitude", altitude);
            fix.put("satellites", satellites);
            fix.put("provider", LocationManager.GPS_PROVIDER);
            root.put("fix", fix);

            payload = root.toString();
        } catch (Throwable t) {
            Log.w(TAG, "build route json failed: " + t);
            return;
        }

        File target = new File(ROUTE_FILE);
        File tmp = new File(ROUTE_FILE_TMP);
        try {
            FileOutputStream fos = new FileOutputStream(tmp, false);
            OutputStreamWriter w = new OutputStreamWriter(fos, StandardCharsets.UTF_8);
            w.write(payload);
            w.flush();
            w.close();
            fos.close();

            if (!tmp.renameTo(target)) {
                target.delete();
                tmp.renameTo(target);
            }

            try {
                target.setReadable(true, false);
                target.setWritable(true, false);
            } catch (Throwable ignored) {
            }
        } catch (Throwable t) {
            Log.w(TAG, "writeRouteFile failed (need root / selinux permissive for " + ROUTE_FILE + "): " + t);
        }
    }

    public String describe() {
        return "seq=" + seq
                + " lat=" + lat
                + " lon=" + lon
                + " spd=" + speed
                + " acc=" + accuracy
                + " running=" + running;
    }
}
