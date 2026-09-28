using System;
using System.Collections.Generic;

namespace CampusRun.Core
{
    public enum PaceStatus
    {
        NotEnoughData,
        TooSlow,
        Ok,
        TooFast
    }

    public sealed class RunSession
    {
        private Vec2 _lastTrueLocal;
        private bool _hasLastTrue;
        private LatLon _lastAcceptedFix;
        private bool _hasLastAccepted;
        private double _fixAccumulator;

        public RunSession(WorldGeoMapper mapper, CampusLayout campus, ulong seed)
        {
            Mapper = mapper;
            Campus = campus;
            Seed = seed;
            Feed = new GpsFeedBuilder(mapper.Frame, seed);
            Rng = new Rng(seed ^ 0x1234567UL);

            MaxAcceptedAccuracyMeters = 35.0;
            MaxAcceptedSpeedMps = 8.0;
            CheckpointRadiusMeters = 80.0;
            CheckpointCount = 3;
            MinAveragePaceWarmupSeconds = 25.0;
            FixIntervalSeconds = 1.0;

            WorldPosition = Vec2.Zero;
            WorldVelocity = Vec2.Zero;
            Route = campus != null ? campus.MainRoute : null;
            Checkpoints = new List<CheckpointDef>();
        }

        public ulong Seed { get; private set; }

        public WorldGeoMapper Mapper { get; private set; }

        public CampusLayout Campus { get; private set; }

        public GpsFeedBuilder Feed { get; private set; }

        public Rng Rng { get; private set; }

        public Polyline Route { get; set; }

        public List<CheckpointDef> Checkpoints { get; set; }

        public Vec2 WorldPosition { get; set; }

        public Vec2 WorldVelocity { get; private set; }

        public double RouteDistance { get; set; }

        public double TrueDistanceMeters { get; private set; }

        public double RecordedDistanceMeters { get; private set; }

        public double DurationSeconds { get; private set; }

        public bool IsRunning { get; private set; }

        public GpsFix LastFix { get; private set; }

        public string LastEnvelopeJson { get; private set; }

        public double CheckpointRadiusMeters { get; set; }

        public int CheckpointCount { get; set; }

        public double MaxAcceptedAccuracyMeters { get; set; }

        public double MaxAcceptedSpeedMps { get; set; }

        public double MinAveragePaceWarmupSeconds { get; set; }

        public double FixIntervalSeconds { get; set; }

        public int FixCount { get; private set; }

        public double TargetSpeedMps { get; set; }

        public int ClearedCheckpointCount
        {
            get
            {
                int n = 0;
                for (int i = 0; i < Checkpoints.Count; i++)
                {
                    if (Checkpoints[i].Cleared)
                    {
                        n++;
                    }
                }
                return n;
            }
        }

        public double Progress
        {
            get
            {
                if (Route == null || Route.TotalLength <= 1e-6)
                {
                    return 0.0;
                }
                return RouteDistance / Route.TotalLength;
            }
        }

        public double RecordedAverageSpeedMps
        {
            get
            {
                if (DurationSeconds < 1.0)
                {
                    return 0.0;
                }
                return RecordedDistanceMeters / DurationSeconds;
            }
        }

        public double RecordedAveragePaceSecPerKm
        {
            get { return PaceController.SpeedToPaceSecPerKm(RecordedAverageSpeedMps); }
        }

        public PaceStatus AveragePaceStatus
        {
            get
            {
                if (DurationSeconds < MinAveragePaceWarmupSeconds)
                {
                    return PaceStatus.NotEnoughData;
                }
                double s = RecordedAverageSpeedMps;
                if (s < Feed.Pace.MinSpeedMps)
                {
                    return PaceStatus.TooSlow;
                }
                if (s > Feed.Pace.MaxSpeedMps)
                {
                    return PaceStatus.TooFast;
                }
                return PaceStatus.Ok;
            }
        }

        public void ResetToRouteStart()
        {
            if (Route == null)
            {
                return;
            }
            RouteDistance = 0.0;
            WorldPosition = Route.PointAt(0.0);
            WorldVelocity = Vec2.Zero;
            ResetCounters();
        }

        public void ResetToPosition(Vec2 worldPosition)
        {
            WorldPosition = worldPosition;
            WorldVelocity = Vec2.Zero;
            ResetCounters();
        }

        private void ResetCounters()
        {
            TrueDistanceMeters = 0.0;
            RecordedDistanceMeters = 0.0;
            DurationSeconds = 0.0;
            _hasLastTrue = false;
            _hasLastAccepted = false;
            _lastTrueLocal = Vec2.Zero;
            _fixAccumulator = 0.0;
            FixCount = 0;
            Feed.Reset();
        }

        public void StartRun()
        {
            IsRunning = true;
            DurationSeconds = 0.0;
            _hasLastAccepted = false;
            Feed.Pace.Reset();
        }

        public void StopRun()
        {
            IsRunning = false;
        }

        public void SpawnCheckpoints()
        {
            Checkpoints = CheckpointSpawner.Spawn(
                Route,
                Mapper.Frame,
                CheckpointCount,
                CheckpointRadiusMeters,
                120.0,
                0.15,
                Rng);
        }

        public int UpdateCheckpoints(LatLon currentFix)
        {
            int newlyCleared = 0;
            for (int i = 0; i < Checkpoints.Count; i++)
            {
                CheckpointDef cp = Checkpoints[i];
                if (cp.Cleared)
                {
                    continue;
                }
                LatLon cpGeo = cp.ToGeo(Mapper.Frame);
                if (GeoMath.Haversine(currentFix, cpGeo) <= cp.RadiusMeters)
                {
                    cp.Cleared = true;
                    newlyCleared++;
                }
            }
            return newlyCleared;
        }

        public GpsFix Tick(double dt, long wallClockMs, Vec2 desiredDirectionWorld, double baseDesiredSpeedMps)
        {
            if (dt < 0.0)
            {
                dt = 0.0;
            }
            if (IsRunning)
            {
                DurationSeconds += dt;
            }

            PaceSample ps = Feed.UpdatePace(dt, IsRunning ? baseDesiredSpeedMps : 0.0);

            Vec2 dir = desiredDirectionWorld.Normalized();
            double speed = dir.SqrLength < 1e-12 ? 0.0 : ps.AppliedSpeedMps;

            WorldVelocity = dir * speed;
            Vec2 newWorldPos = WorldPosition + WorldVelocity * dt;

            return CommitFrame(dt, wallClockMs, newWorldPos);
        }

        public GpsFix TickAutopilot(double dt, long wallClockMs, double baseDesiredSpeedMps)
        {
            if (Route == null)
            {
                return Tick(dt, wallClockMs, Vec2.Zero, 0.0);
            }

            if (dt < 0.0)
            {
                dt = 0.0;
            }
            if (IsRunning)
            {
                DurationSeconds += dt;
            }

            PaceSample ps = Feed.UpdatePace(dt, IsRunning ? baseDesiredSpeedMps : 0.0);

            RouteDistance += ps.AppliedSpeedMps * dt;
            Vec2 newWorldPos = Route.PointAt(RouteDistance);
            WorldVelocity = Route.TangentAt(RouteDistance) * ps.AppliedSpeedMps;

            return CommitFrame(dt, wallClockMs, newWorldPos);
        }

        private GpsFix CommitFrame(double dt, long wallClockMs, Vec2 newWorldPos)
        {
            Vec2 newLocal = Mapper.WorldToLocal(newWorldPos);

            if (_hasLastTrue)
            {
                TrueDistanceMeters += Vec2.Distance(newLocal, _lastTrueLocal);
            }
            _lastTrueLocal = newLocal;
            _hasLastTrue = true;

            WorldPosition = newWorldPos;

            double interval = FixIntervalSeconds > 0.01 ? FixIntervalSeconds : 0.01;
            _fixAccumulator += dt;

            if (FixCount > 0 && _fixAccumulator < interval)
            {
                return LastFix;
            }

            double fixDt = _fixAccumulator;
            _fixAccumulator = 0.0;

            GpsFix fix = Feed.Build(fixDt, newLocal, WorldVelocity, wallClockMs);

            AccumulateRecorded(fix, fixDt);
            UpdateCheckpoints(new LatLon(fix.Lat, fix.Lon));

            FixCount++;
            LastFix = fix;
            LastEnvelopeJson = Feed.BuildEnvelope(fix, true, IsRunning, RecordedDistanceMeters, DurationSeconds);
            return fix;
        }

        private void AccumulateRecorded(GpsFix fix, double dt)
        {
            if (!IsRunning)
            {
                return;
            }

            if (fix.Accuracy > MaxAcceptedAccuracyMeters)
            {
                return;
            }

            LatLon current = new LatLon(fix.Lat, fix.Lon);

            if (!_hasLastAccepted)
            {
                _lastAcceptedFix = current;
                _hasLastAccepted = true;
                return;
            }

            double step = GeoMath.Haversine(_lastAcceptedFix, current);

            if (dt > 1e-6)
            {
                double implied = step / dt;
                if (implied > MaxAcceptedSpeedMps)
                {
                    return;
                }
            }

            RecordedDistanceMeters += step;
            _lastAcceptedFix = current;
        }
    }
}
