using System;

namespace CampusRun.Core
{
    public struct PaceSample
    {
        public double DesiredSpeedMps;
        public double AppliedSpeedMps;
        public bool WasClampedLow;
        public bool WasClampedHigh;
        public bool IsStopped;
    }

    public sealed class PaceController
    {
        private readonly Rng _rng;
        private double _wander;
        private double _current;

        public PaceController(ulong seed)
        {
            _rng = new Rng(seed);
            _wander = 0.0;
            _current = 0.0;
            MinPaceSecPerKm = 180.0;
            MaxPaceSecPerKm = 540.0;
            WanderRatio = 0.10;
            WanderCorrelationSeconds = 25.0;
            ResponseSeconds = 3.0;
        }

        public double MinPaceSecPerKm { get; set; }

        public double MaxPaceSecPerKm { get; set; }

        public double WanderRatio { get; set; }

        public double WanderCorrelationSeconds { get; set; }

        public double ResponseSeconds { get; set; }

        public double MinSpeedMps
        {
            get { return 1000.0 / MaxPaceSecPerKm; }
        }

        public double MaxSpeedMps
        {
            get { return 1000.0 / MinPaceSecPerKm; }
        }

        public double CurrentSpeedMps
        {
            get { return _current; }
        }

        public void Prime(double speedMps)
        {
            _current = Clamp(speedMps, MinSpeedMps, MaxSpeedMps);
        }

        public void Reset()
        {
            _wander = 0.0;
            _current = 0.0;
        }

        public PaceSample Update(double dt, double desiredSpeedMps)
        {
            PaceSample sample = new PaceSample();
            sample.DesiredSpeedMps = desiredSpeedMps;

            if (desiredSpeedMps <= 0.0)
            {
                _current = 0.0;
                sample.AppliedSpeedMps = 0.0;
                sample.IsStopped = true;
                return sample;
            }

            if (dt <= 0.0)
            {
                sample.AppliedSpeedMps = _current;
                return sample;
            }

            double tau = Math.Max(1.0, WanderCorrelationSeconds);
            double decay = Math.Exp(-dt / tau);
            double drive = Math.Sqrt(Math.Max(0.0, 1.0 - decay * decay));
            _wander = _wander * decay + drive * _rng.NextGaussian();

            double target = desiredSpeedMps * (1.0 + _wander * WanderRatio);

            if (target < MinSpeedMps)
            {
                target = MinSpeedMps;
                sample.WasClampedLow = true;
            }
            else if (target > MaxSpeedMps)
            {
                target = MaxSpeedMps;
                sample.WasClampedHigh = true;
            }

            if (_current <= 1e-6)
            {
                _current = target;
                sample.AppliedSpeedMps = _current;
                return sample;
            }

            double respTau = Math.Max(0.1, ResponseSeconds);
            double alpha = 1.0 - Math.Exp(-dt / respTau);
            _current = _current + (target - _current) * alpha;

            sample.AppliedSpeedMps = _current;
            return sample;
        }

        private static double Clamp(double v, double lo, double hi)
        {
            if (v < lo)
            {
                return lo;
            }
            if (v > hi)
            {
                return hi;
            }
            return v;
        }

        public static double SpeedToPaceSecPerKm(double speedMps)
        {
            return speedMps > 1e-6 ? 1000.0 / speedMps : 0.0;
        }

        public static string FormatPace(double paceSecPerKm)
        {
            if (paceSecPerKm <= 0.0 || double.IsInfinity(paceSecPerKm) || double.IsNaN(paceSecPerKm))
            {
                return "--'--\"";
            }
            int total = (int)Math.Round(paceSecPerKm);
            int minutes = total / 60;
            int seconds = total % 60;
            return minutes.ToString("00") + "'" + seconds.ToString("00") + "\"";
        }

        public static string FormatDuration(double seconds)
        {
            if (seconds < 0.0 || double.IsNaN(seconds))
            {
                seconds = 0.0;
            }
            int total = (int)seconds;
            int h = total / 3600;
            int m = (total % 3600) / 60;
            int s = total % 60;
            if (h > 0)
            {
                return h.ToString("00") + ":" + m.ToString("00") + ":" + s.ToString("00");
            }
            return m.ToString("00") + ":" + s.ToString("00");
        }
    }
}
