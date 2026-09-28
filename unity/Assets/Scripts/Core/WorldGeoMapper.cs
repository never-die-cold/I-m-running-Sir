using System;

namespace CampusRun.Core
{
    public sealed class WorldGeoMapper
    {
        public WorldGeoMapper(LatLon origin, double metersPerWorldUnit)
        {
            Frame = new LocalFrame(origin);
            MetersPerWorldUnit = metersPerWorldUnit <= 1e-9 ? 1.0 : metersPerWorldUnit;
            WorldOriginLocalMeters = Vec2.Zero;
            RotationRad = 0.0;
        }

        public LocalFrame Frame { get; private set; }

        public double MetersPerWorldUnit { get; set; }

        public Vec2 WorldOriginLocalMeters { get; set; }

        public double RotationRad { get; set; }

        public Vec2 WorldToLocal(Vec2 world)
        {
            double c = Math.Cos(RotationRad);
            double s = Math.Sin(RotationRad);
            Vec2 scaled = new Vec2(world.X * MetersPerWorldUnit, world.Y * MetersPerWorldUnit);
            Vec2 rotated = new Vec2(scaled.X * c - scaled.Y * s, scaled.X * s + scaled.Y * c);
            return rotated + WorldOriginLocalMeters;
        }

        public Vec2 LocalToWorld(Vec2 local)
        {
            Vec2 rel = local - WorldOriginLocalMeters;
            double c = Math.Cos(-RotationRad);
            double s = Math.Sin(-RotationRad);
            Vec2 rotated = new Vec2(rel.X * c - rel.Y * s, rel.X * s + rel.Y * c);
            return new Vec2(rotated.X / MetersPerWorldUnit, rotated.Y / MetersPerWorldUnit);
        }

        public LatLon WorldToGeo(Vec2 world)
        {
            return Frame.ToGeo(WorldToLocal(world));
        }

        public Vec2 GeoToWorld(LatLon geo)
        {
            return LocalToWorld(Frame.ToLocal(geo));
        }

        public double WorldDistanceToMeters(double worldDistance)
        {
            return worldDistance * MetersPerWorldUnit;
        }

        public double MetersToWorldDistance(double meters)
        {
            return meters / MetersPerWorldUnit;
        }
    }
}
