using System;

namespace CampusRun.Core
{
    public sealed class JitterNoise
    {
        private Vec2 _state;
        private double _amplitudeMeters;
        private double _correlationSeconds;

        public JitterNoise(double amplitudeMeters, double correlationSeconds, ulong seed)
        {
            _amplitudeMeters = amplitudeMeters;
            _correlationSeconds = correlationSeconds;
            _state = Vec2.Zero;
            Rng = new Rng(seed);
        }

        public Rng Rng { get; private set; }

        public double AmplitudeMeters
        {
            get { return _amplitudeMeters; }
            set { _amplitudeMeters = value; }
        }

        public double CorrelationSeconds
        {
            get { return _correlationSeconds; }
            set { _correlationSeconds = value < 0.1 ? 0.1 : value; }
        }

        public Vec2 Current
        {
            get { return _state; }
        }

        public void Reset()
        {
            _state = Vec2.Zero;
        }

        public Vec2 Update(double dt)
        {
            if (dt <= 0.0)
            {
                return _state;
            }

            double tau = _correlationSeconds;
            double sigma = _amplitudeMeters * Math.Sqrt(2.0 / tau);
            double decay = Math.Exp(-dt / tau);
            double drive = sigma * Math.Sqrt(Math.Max(0.0, 1.0 - decay * decay));

            _state = new Vec2(
                _state.X * decay + drive * Rng.NextGaussian(),
                _state.Y * decay + drive * Rng.NextGaussian());

            return _state;
        }
    }
}
