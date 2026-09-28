using System;
using System.Globalization;
using System.Text;

namespace CampusRun.Core
{
    public sealed class GpsFeedBuilder
    {
        private readonly LocalFrame _frame;
        private readonly JitterNoise _jitter;
        private readonly Rng _rng;
        private readonly PaceController _pace;

        private Vec2 _lastTrueLocal;
        private bool _hasLastTrue;
        private double _smoothedSpeed;
        private double _bearing;
        private double _accuracy;
        private long _seq;
        private long _simElapsedNanos;
        private PaceSample _lastPace;

        public GpsFeedBuilder(LocalFrame frame, ulong seed)
        {
            _frame = frame;
            _jitter = new JitterNoise(3.0, 12.0, seed ^ 0xA5A5A5A5UL);
            _rng = new Rng(seed ^ 0x5A5A5A5AUL);
            _pace = new PaceController(seed ^ 0x3C3C3C3CUL);
            _lastTrueLocal = Vec2.Zero;
            _hasLastTrue = false;
            _smoothedSpeed = 0.0;
            _bearing = 0.0;
            _accuracy = 8.0;
            _seq = 0;
            _simElapsedNanos = 0;

            EnableJitter = true;
            AccuracyMinMeters = 5.5;
            AccuracyMaxMeters = 12.0;
            AccuracyResponseSeconds = 8.0;
            AltitudeMeters = 15.0;
            AltitudeDriftMeters = 4.0;
            SatelliteMin = 7;
            SatelliteMax = 12;
            BearingNoiseDeg = 3.0;
            SpeedSmoothingSeconds = 4.0;
            Provider = "gps";
        }

        public bool EnableJitter { get; set; }

        public double AccuracyMinMeters { get; set; }

        public double AccuracyMaxMeters { get; set; }

        public double AccuracyResponseSeconds { get; set; }

        public double AltitudeMeters { get; set; }

        public double AltitudeDriftMeters { get; set; }

        public int SatelliteMin { get; set; }

        public int SatelliteMax { get; set; }

        public double BearingNoiseDeg { get; set; }

        public double SpeedSmoothingSeconds { get; set; }

        public string Provider { get; set; }

        public double MinPaceSecPerKm
        {
            get { return _pace.MinPaceSecPerKm; }
            set { _pace.MinPaceSecPerKm = value; }
        }

        public double MaxPaceSecPerKm
        {
            get { return _pace.MaxPaceSecPerKm; }
            set { _pace.MaxPaceSecPerKm = value; }
        }

        public double JitterAmplitudeMeters
        {
            get { return _jitter.AmplitudeMeters; }
            set { _jitter.AmplitudeMeters = value; }
        }

        public double JitterCorrelationSeconds
        {
            get { return _jitter.CorrelationSeconds; }
            set { _jitter.CorrelationSeconds = value; }
        }

        public PaceController Pace
        {
            get { return _pace; }
        }

        public PaceSample LastPace
        {
            get { return _lastPace; }
        }

        public long Sequence
        {
            get { return _seq; }
        }

        public double SmoothedSpeedMps
        {
            get { return _smoothedSpeed; }
        }

        public void Reset()
        {
            _hasLastTrue = false;
            _lastTrueLocal = Vec2.Zero;
            _smoothedSpeed = 0.0;
            _bearing = 0.0;
            _accuracy = 0.5 * (AccuracyMinMeters + AccuracyMaxMeters);
            _seq = 0;
            _simElapsedNanos = 0;
            _jitter.Reset();
            _pace.Reset();
        }

        public PaceSample UpdatePace(double dt, double baseDesiredSpeedMps)
        {
            _lastPace = _pace.Update(dt, baseDesiredSpeedMps);
            return _lastPace;
        }

        public GpsFix Build(double dt, Vec2 trueLocalMeters, Vec2 velocityMps, long wallClockMs)
        {
            if (dt < 0.0)
            {
                dt = 0.0;
            }

            double trueStep = 0.0;
            if (_hasLastTrue && dt > 1e-6)
            {
                trueStep = Vec2.Distance(trueLocalMeters, _lastTrueLocal);
            }

            double instantSpeed = dt > 1e-6 ? trueStep / dt : 0.0;
            if (_smoothedSpeed <= 0.0 && instantSpeed > 0.0)
            {
                _smoothedSpeed = instantSpeed;
            }
            else
            {
                double sfTau = Math.Max(0.2, SpeedSmoothingSeconds);
                double sfAlpha = dt <= 0.0 ? 1.0 : 1.0 - Math.Exp(-dt / sfTau);
                _smoothedSpeed = _smoothedSpeed + (instantSpeed - _smoothedSpeed) * sfAlpha;
            }
            if (_smoothedSpeed < 0.15)
            {
                _smoothedSpeed = 0.0;
            }

            Vec2 jitterOffset = EnableJitter ? _jitter.Update(dt) : Vec2.Zero;
            Vec2 reportedLocal = trueLocalMeters + jitterOffset;

            if (_smoothedSpeed > 0.35)
            {
                Vec2 dir = velocityMps.Normalized();
                if (dir.SqrLength < 1e-12 && _hasLastTrue)
                {
                    dir = (trueLocalMeters - _lastTrueLocal).Normalized();
                }
                if (dir.SqrLength > 1e-12)
                {
                    double targetBearing = GeoMath.NormalizeBearing(dir.AngleRad() * 180.0 / Math.PI);
                    double diff = targetBearing - _bearing;
                    while (diff > 180.0)
                    {
                        diff -= 360.0;
                    }
                    while (diff < -180.0)
                    {
                        diff += 360.0;
                    }
                    double bAlpha = dt <= 0.0 ? 1.0 : 1.0 - Math.Exp(-dt / 2.0);
                    _bearing = GeoMath.NormalizeBearing(_bearing + diff * bAlpha);
                }
            }

            double accAlpha = dt <= 0.0 ? 1.0 : 1.0 - Math.Exp(-dt / Math.Max(0.5, AccuracyResponseSeconds));
            double accTarget = _rng.Range(AccuracyMinMeters, AccuracyMaxMeters);
            _accuracy = _accuracy + (accTarget - _accuracy) * accAlpha;

            LatLon geo = _frame.ToGeo(reportedLocal);

            _lastTrueLocal = trueLocalMeters;
            _hasLastTrue = true;
            _simElapsedNanos += (long)(dt * 1e9);

            GpsFix fix = new GpsFix();
            fix.Lat = geo.Lat;
            fix.Lon = geo.Lon;
            fix.TimeMs = wallClockMs;
            fix.ElapsedRealtimeNanos = _simElapsedNanos;
            fix.Accuracy = _accuracy;
            fix.SpeedMps = _smoothedSpeed;
            fix.BearingDeg = GeoMath.NormalizeBearing(_bearing + _rng.Range(-BearingNoiseDeg, BearingNoiseDeg));
            fix.Altitude = AltitudeMeters + _rng.Range(-AltitudeDriftMeters, AltitudeDriftMeters);
            fix.Satellites = _rng.RangeInt(SatelliteMin, SatelliteMax + 1);
            fix.Provider = Provider;

            _seq++;
            return fix;
        }

        public string BuildEnvelope(GpsFix fix, bool active, bool isRunning, double distanceMeters, double durationSeconds)
        {
            StringBuilder sb = new StringBuilder(420);
            sb.Append('{');
            sb.Append("\"v\":1,");
            sb.Append("\"seq\":").Append(_seq.ToString(CultureInfo.InvariantCulture)).Append(',');
            sb.Append("\"active\":").Append(active ? "true" : "false").Append(',');
            sb.Append("\"running\":").Append(isRunning ? "true" : "false").Append(',');
            sb.Append("\"distanceMeters\":").Append(GpsFix.F(distanceMeters, 2)).Append(',');
            sb.Append("\"durationSeconds\":").Append(GpsFix.F(durationSeconds, 1)).Append(',');
            sb.Append("\"paceSecPerKm\":").Append(GpsFix.F(PaceController.SpeedToPaceSecPerKm(_smoothedSpeed), 1)).Append(',');
            sb.Append("\"updatedAtMs\":").Append(fix.TimeMs.ToString(CultureInfo.InvariantCulture)).Append(',');
            sb.Append("\"fix\":").Append(fix.ToJson());
            sb.Append('}');
            return sb.ToString();
        }
    }
}
