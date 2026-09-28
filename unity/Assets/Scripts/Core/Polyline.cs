using System;
using System.Collections.Generic;

namespace CampusRun.Core
{
    public struct PolylineHit
    {
        public double DistanceAlong;
        public double Offset;
        public Vec2 Point;
        public int SegmentIndex;
        public double SegmentT;
    }

    public sealed class Polyline
    {
        private readonly Vec2[] _points;
        private readonly double[] _cumulative;
        private readonly bool _closed;

        public Polyline(Vec2[] points, bool closed)
        {
            if (points == null || points.Length < 2)
            {
                throw new ArgumentException("Polyline needs at least two points.");
            }

            _closed = closed;
            if (closed)
            {
                Vec2 first = points[0];
                Vec2 last = points[points.Length - 1];
                if (Vec2.Distance(first, last) > 1e-9)
                {
                    Vec2[] extended = new Vec2[points.Length + 1];
                    Array.Copy(points, extended, points.Length);
                    extended[points.Length] = first;
                    points = extended;
                }
            }

            _points = points;
            _cumulative = new double[_points.Length];
            _cumulative[0] = 0.0;
            for (int i = 1; i < _points.Length; i++)
            {
                _cumulative[i] = _cumulative[i - 1] + Vec2.Distance(_points[i - 1], _points[i]);
            }
        }

        public bool IsClosed
        {
            get { return _closed; }
        }

        public int PointCount
        {
            get { return _points.Length; }
        }

        public Vec2 this[int index]
        {
            get { return _points[index]; }
        }

        public Vec2[] Points
        {
            get { return _points; }
        }

        public double TotalLength
        {
            get { return _cumulative[_cumulative.Length - 1]; }
        }

        public double WrapDistance(double distance)
        {
            double total = TotalLength;
            if (total <= 1e-9)
            {
                return 0.0;
            }
            if (_closed)
            {
                double d = distance % total;
                if (d < 0.0)
                {
                    d += total;
                }
                return d;
            }
            if (distance < 0.0)
            {
                return 0.0;
            }
            if (distance > total)
            {
                return total;
            }
            return distance;
        }

        public Vec2 PointAt(double distance)
        {
            double d = WrapDistance(distance);
            int seg = FindSegment(d);
            double segStart = _cumulative[seg];
            double segLen = _cumulative[seg + 1] - segStart;
            double t = segLen <= 1e-12 ? 0.0 : (d - segStart) / segLen;
            return Vec2.Lerp(_points[seg], _points[seg + 1], t);
        }

        public Vec2 TangentAt(double distance)
        {
            double d = WrapDistance(distance);
            int seg = FindSegment(d);
            Vec2 dir = _points[seg + 1] - _points[seg];
            Vec2 n = dir.Normalized();
            if (n.SqrLength <= 1e-18)
            {
                return new Vec2(1.0, 0.0);
            }
            return n;
        }

        public PolylineHit Project(Vec2 p)
        {
            PolylineHit best = new PolylineHit();
            best.Offset = double.MaxValue;
            best.DistanceAlong = 0.0;
            best.Point = _points[0];
            best.SegmentIndex = 0;
            best.SegmentT = 0.0;

            int segCount = _points.Length - 1;
            for (int i = 0; i < segCount; i++)
            {
                Vec2 a = _points[i];
                Vec2 ab = _points[i + 1] - a;
                double len2 = ab.SqrLength;
                double t = 0.0;
                if (len2 > 1e-12)
                {
                    t = Vec2.Dot(p - a, ab) / len2;
                    if (t < 0.0)
                    {
                        t = 0.0;
                    }
                    else if (t > 1.0)
                    {
                        t = 1.0;
                    }
                }

                Vec2 closest = Vec2.Lerp(a, _points[i + 1], t);
                double dist = Vec2.Distance(p, closest);
                if (dist < best.Offset)
                {
                    best.Offset = dist;
                    best.Point = closest;
                    best.SegmentIndex = i;
                    best.SegmentT = t;
                    best.DistanceAlong = _cumulative[i] + t * Math.Sqrt(len2);
                }
            }

            return best;
        }

        public static Polyline Smooth(Vec2[] controlPoints, bool closed, int subdivisionsPerSegment)
        {
            if (controlPoints == null || controlPoints.Length < 2)
            {
                throw new ArgumentException("Need at least two control points.");
            }
            if (subdivisionsPerSegment < 1)
            {
                subdivisionsPerSegment = 1;
            }

            int n = controlPoints.Length;
            List<Vec2> result = new List<Vec2>();
            int segCount = closed ? n : n - 1;

            for (int i = 0; i < segCount; i++)
            {
                Vec2 p0 = GetControl(controlPoints, i - 1, closed);
                Vec2 p1 = GetControl(controlPoints, i, closed);
                Vec2 p2 = GetControl(controlPoints, i + 1, closed);
                Vec2 p3 = GetControl(controlPoints, i + 2, closed);

                for (int s = 0; s < subdivisionsPerSegment; s++)
                {
                    double t = (double)s / subdivisionsPerSegment;
                    result.Add(CatmullRom(p0, p1, p2, p3, t));
                }
            }

            if (closed)
            {
                result.Add(result[0]);
            }
            else
            {
                result.Add(controlPoints[n - 1]);
            }

            return new Polyline(result.ToArray(), false);
        }

        private static Vec2 GetControl(Vec2[] pts, int index, bool closed)
        {
            int n = pts.Length;
            if (closed)
            {
                int i = ((index % n) + n) % n;
                return pts[i];
            }
            if (index < 0)
            {
                return pts[0];
            }
            if (index >= n)
            {
                return pts[n - 1];
            }
            return pts[index];
        }

        private static Vec2 CatmullRom(Vec2 p0, Vec2 p1, Vec2 p2, Vec2 p3, double t)
        {
            double t2 = t * t;
            double t3 = t2 * t;
            double x = 0.5 * ((2.0 * p1.X)
                + (-p0.X + p2.X) * t
                + (2.0 * p0.X - 5.0 * p1.X + 4.0 * p2.X - p3.X) * t2
                + (-p0.X + 3.0 * p1.X - 3.0 * p2.X + p3.X) * t3);
            double y = 0.5 * ((2.0 * p1.Y)
                + (-p0.Y + p2.Y) * t
                + (2.0 * p0.Y - 5.0 * p1.Y + 4.0 * p2.Y - p3.Y) * t2
                + (-p0.Y + 3.0 * p1.Y - 3.0 * p2.Y + p3.Y) * t3);
            return new Vec2(x, y);
        }

        public Polyline Densified(double maxSegmentMeters)
        {
            if (maxSegmentMeters <= 0.01)
            {
                maxSegmentMeters = 0.01;
            }

            List<Vec2> outPts = new List<Vec2>();
            for (int i = 0; i < _points.Length - 1; i++)
            {
                Vec2 a = _points[i];
                Vec2 b = _points[i + 1];
                double len = Vec2.Distance(a, b);
                int steps = Math.Max(1, (int)Math.Ceiling(len / maxSegmentMeters));
                for (int s = 0; s < steps; s++)
                {
                    outPts.Add(Vec2.Lerp(a, b, (double)s / steps));
                }
            }
            outPts.Add(_points[_points.Length - 1]);
            return new Polyline(outPts.ToArray(), false);
        }

        private int FindSegment(double distance)
        {
            int lo = 0;
            int hi = _cumulative.Length - 1;
            while (lo < hi - 1)
            {
                int mid = (lo + hi) / 2;
                if (_cumulative[mid] <= distance)
                {
                    lo = mid;
                }
                else
                {
                    hi = mid;
                }
            }
            if (lo >= _points.Length - 1)
            {
                lo = _points.Length - 2;
            }
            return lo;
        }
    }
}
