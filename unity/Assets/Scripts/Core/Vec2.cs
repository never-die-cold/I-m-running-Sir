using System;

namespace CampusRun.Core
{
    public struct Vec2
    {
        public double X;
        public double Y;

        public Vec2(double x, double y)
        {
            X = x;
            Y = y;
        }

        public static readonly Vec2 Zero = new Vec2(0.0, 0.0);

        public double Length
        {
            get { return Math.Sqrt(X * X + Y * Y); }
        }

        public double SqrLength
        {
            get { return X * X + Y * Y; }
        }

        public bool IsFinite
        {
            get { return !double.IsNaN(X) && !double.IsNaN(Y) && !double.IsInfinity(X) && !double.IsInfinity(Y); }
        }

        public static Vec2 operator +(Vec2 a, Vec2 b)
        {
            return new Vec2(a.X + b.X, a.Y + b.Y);
        }

        public static Vec2 operator -(Vec2 a, Vec2 b)
        {
            return new Vec2(a.X - b.X, a.Y - b.Y);
        }

        public static Vec2 operator *(Vec2 a, double s)
        {
            return new Vec2(a.X * s, a.Y * s);
        }

        public static Vec2 operator *(double s, Vec2 a)
        {
            return new Vec2(a.X * s, a.Y * s);
        }

        public static Vec2 operator /(Vec2 a, double s)
        {
            return new Vec2(a.X / s, a.Y / s);
        }

        public static Vec2 operator -(Vec2 a)
        {
            return new Vec2(-a.X, -a.Y);
        }

        public static double Dot(Vec2 a, Vec2 b)
        {
            return a.X * b.X + a.Y * b.Y;
        }

        public static double Cross(Vec2 a, Vec2 b)
        {
            return a.X * b.Y - a.Y * b.X;
        }

        public Vec2 Normalized()
        {
            double len = Length;
            if (len <= 1e-12)
            {
                return Zero;
            }
            return new Vec2(X / len, Y / len);
        }

        public static Vec2 Lerp(Vec2 a, Vec2 b, double t)
        {
            return new Vec2(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);
        }

        public static double Distance(Vec2 a, Vec2 b)
        {
            return (a - b).Length;
        }

        public static Vec2 FromAngleRad(double radians)
        {
            return new Vec2(Math.Cos(radians), Math.Sin(radians));
        }

        public double AngleRad()
        {
            return Math.Atan2(Y, X);
        }

        public override string ToString()
        {
            return "(" + X.ToString("F2") + ", " + Y.ToString("F2") + ")";
        }
    }
}
