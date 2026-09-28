using System;
using System.Collections.Generic;

namespace CampusRun.Core
{
    public sealed class RoadDef
    {
        public string Name;
        public Vec2[] Points;
        public double WidthMeters;
        public bool Closed;

        public RoadDef(string name, Vec2[] points, double widthMeters, bool closed)
        {
            Name = name;
            Points = points;
            WidthMeters = widthMeters;
            Closed = closed;
        }
    }

    public sealed class BuildingDef
    {
        public string Name;
        public Vec2 Center;
        public Vec2 Size;
        public double RotationRad;
        public string Kind;

        public BuildingDef(string name, Vec2 center, Vec2 size, string kind, double rotationRad)
        {
            Name = name;
            Center = center;
            Size = size;
            Kind = kind;
            RotationRad = rotationRad;
        }
    }

    public sealed class CheckpointDef
    {
        public int Index;
        public double RouteDistance;
        public Vec2 LocalMeters;
        public double RadiusMeters;
        public bool Cleared;

        public LatLon ToGeo(LocalFrame frame)
        {
            return frame.ToGeo(LocalMeters);
        }
    }

    public sealed class CampusLayout
    {
        public LatLon Origin;
        public string Name;
        public List<RoadDef> Roads = new List<RoadDef>();
        public List<BuildingDef> Buildings = new List<BuildingDef>();
        public Polyline MainRoute;
        public Polyline OuterLoop;
        public Polyline TrackLoop;

        public static CampusLayout CreateDemo()
        {
            CampusLayout campus = new CampusLayout();
            campus.Name = "示例校园（占位数据，请替换为你学校的真实坐标）";
            campus.Origin = new LatLon(30.0000000, 120.0000000);

            Vec2[] outer = RoundedRect(new Vec2(-360.0, -260.0), new Vec2(360.0, 260.0), 70.0, 8);
            campus.OuterLoop = new Polyline(outer, true);
            campus.Roads.Add(new RoadDef("北环路", outer, 8.0, true));

            campus.Roads.Add(new RoadDef("中轴路",
                new Vec2[] { new Vec2(0.0, -260.0), new Vec2(0.0, 260.0) }, 7.0, false));

            campus.Roads.Add(new RoadDef("东横路",
                new Vec2[] { new Vec2(-360.0, 0.0), new Vec2(360.0, 0.0) }, 6.0, false));

            campus.Roads.Add(new RoadDef("西横路",
                new Vec2[] { new Vec2(-360.0, 150.0), new Vec2(-140.0, 150.0) }, 5.0, false));

            campus.Roads.Add(new RoadDef("操场支路",
                new Vec2[] { new Vec2(-140.0, 150.0), new Vec2(0.0, 150.0) }, 5.0, false));

            campus.Roads.Add(new RoadDef("东侧支路",
                new Vec2[] { new Vec2(180.0, 0.0), new Vec2(180.0, 150.0) }, 5.0, false));

            campus.TrackLoop = BuildStadiumTrack(new Vec2(-230.0, 150.0), 42.195, 36.5);
            campus.Roads.Add(new RoadDef("操场跑道", campus.TrackLoop.Points, 1.2, true));

            campus.Buildings.Add(new BuildingDef("图书馆", new Vec2(90.0, 150.0), new Vec2(90.0, 70.0), "library", 0.0));
            campus.Buildings.Add(new BuildingDef("教学楼A", new Vec2(180.0, -70.0), new Vec2(70.0, 110.0), "teach", 0.0));
            campus.Buildings.Add(new BuildingDef("教学楼B", new Vec2(270.0, -70.0), new Vec2(70.0, 110.0), "teach", 0.0));
            campus.Buildings.Add(new BuildingDef("第二食堂", new Vec2(-70.0, -180.0), new Vec2(100.0, 60.0), "canteen", 0.0));
            campus.Buildings.Add(new BuildingDef("宿舍楼1", new Vec2(-330.0, -190.0), new Vec2(40.0, 80.0), "dorm", 0.0));
            campus.Buildings.Add(new BuildingDef("宿舍楼2", new Vec2(-280.0, -190.0), new Vec2(40.0, 80.0), "dorm", 0.0));
            campus.Buildings.Add(new BuildingDef("宿舍楼3", new Vec2(-230.0, -190.0), new Vec2(40.0, 80.0), "dorm", 0.0));
            campus.Buildings.Add(new BuildingDef("体育馆", new Vec2(230.0, 190.0), new Vec2(100.0, 80.0), "gym", 0.0));
            campus.Buildings.Add(new BuildingDef("行政楼", new Vec2(40.0, 215.0), new Vec2(80.0, 50.0), "admin", 0.0));
            campus.Buildings.Add(new BuildingDef("实验楼", new Vec2(-70.0, 60.0), new Vec2(70.0, 60.0), "lab", 0.0));

            campus.MainRoute = campus.OuterLoop;
            return campus;
        }

        public static Vec2[] RoundedRect(Vec2 min, Vec2 max, double radius, int arcSegments)
        {
            List<Vec2> pts = new List<Vec2>();
            double x0 = min.X;
            double y0 = min.Y;
            double x1 = max.X;
            double y1 = max.Y;
            double r = Math.Min(radius, Math.Min((x1 - x0) * 0.5, (y1 - y0) * 0.5));

            AddArc(pts, new Vec2(x1 - r, y0 + r), r, -90.0, 0.0, arcSegments);
            AddArc(pts, new Vec2(x1 - r, y1 - r), r, 0.0, 90.0, arcSegments);
            AddArc(pts, new Vec2(x0 + r, y1 - r), r, 90.0, 180.0, arcSegments);
            AddArc(pts, new Vec2(x0 + r, y0 + r), r, 180.0, 270.0, arcSegments);
            return pts.ToArray();
        }

        private static void AddArc(List<Vec2> pts, Vec2 center, double radius, double degFrom, double degTo, int segments)
        {
            for (int i = 0; i <= segments; i++)
            {
                double t = (double)i / segments;
                double deg = degFrom + (degTo - degFrom) * t;
                double rad = deg * Math.PI / 180.0;
                pts.Add(new Vec2(center.X + radius * Math.Cos(rad), center.Y + radius * Math.Sin(rad)));
            }
        }

        public static Polyline BuildStadiumTrack(Vec2 center, double halfStraight, double radius)
        {
            List<Vec2> pts = new List<Vec2>();
            int arcSteps = 24;

            pts.Add(new Vec2(center.X - halfStraight, center.Y - radius));
            pts.Add(new Vec2(center.X + halfStraight, center.Y - radius));

            for (int i = 1; i <= arcSteps; i++)
            {
                double deg = -90.0 + 180.0 * i / arcSteps;
                double rad = deg * Math.PI / 180.0;
                pts.Add(new Vec2(center.X + halfStraight + radius * Math.Cos(rad), center.Y + radius * Math.Sin(rad)));
            }

            pts.Add(new Vec2(center.X - halfStraight, center.Y + radius));

            for (int i = 1; i <= arcSteps; i++)
            {
                double deg = 90.0 + 180.0 * i / arcSteps;
                double rad = deg * Math.PI / 180.0;
                pts.Add(new Vec2(center.X - halfStraight + radius * Math.Cos(rad), center.Y + radius * Math.Sin(rad)));
            }

            return new Polyline(pts.ToArray(), true);
        }
    }

    public static class CheckpointSpawner
    {
        public static List<CheckpointDef> Spawn(Polyline route, LocalFrame frame, int count, double radiusMeters, double minSeparationMeters, Rng rng)
        {
            return Spawn(route, frame, count, radiusMeters, minSeparationMeters, 0.15, rng);
        }

        public static List<CheckpointDef> Spawn(Polyline route, LocalFrame frame, int count, double radiusMeters, double minSeparationMeters, double startExclusionFraction, Rng rng)
        {
            List<CheckpointDef> result = new List<CheckpointDef>();
            if (route == null || route.TotalLength < 1.0 || count <= 0)
            {
                return result;
            }

            double total = route.TotalLength;
            double lo = Math.Max(0.0, startExclusionFraction) * total;
            double hi = total * 0.98;
            if (hi - lo < 1.0)
            {
                lo = 0.0;
                hi = total;
            }

            List<double> picked = new List<double>();
            int guard = 0;

            while (picked.Count < count && guard < 2000)
            {
                guard++;
                double d = rng.Range(lo, hi);
                bool ok = true;
                for (int i = 0; i < picked.Count; i++)
                {
                    if (Math.Abs(picked[i] - d) < minSeparationMeters)
                    {
                        ok = false;
                        break;
                    }
                }
                if (ok)
                {
                    picked.Add(d);
                }
            }

            picked.Sort();

            for (int i = 0; i < picked.Count; i++)
            {
                CheckpointDef cp = new CheckpointDef();
                cp.Index = i;
                cp.RouteDistance = picked[i];
                cp.LocalMeters = route.PointAt(picked[i]);
                cp.RadiusMeters = radiusMeters;
                cp.Cleared = false;
                result.Add(cp);
            }

            return result;
        }
    }
}
