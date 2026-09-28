using System;

namespace CampusRun.Core
{
    public struct LatLon
    {
        public double Lat;
        public double Lon;

        public LatLon(double lat, double lon)
        {
            Lat = lat;
            Lon = lon;
        }

        public bool IsValid
        {
            get { return Lat >= -90.0 && Lat <= 90.0 && Lon >= -180.0 && Lon <= 180.0; }
        }

        public override string ToString()
        {
            return Lat.ToString("F7") + "," + Lon.ToString("F7");
        }
    }

    public static class GeoMath
    {
        public const double EarthRadiusM = 6371008.8;
        public const double MetersPerDegreeLatMean = 111320.0;

        public static double MetersPerDegLat(double latDeg)
        {
            double phi = latDeg * Math.PI / 180.0;
            return 111132.92
                - 559.82 * Math.Cos(2.0 * phi)
                + 1.175 * Math.Cos(4.0 * phi)
                - 0.0023 * Math.Cos(6.0 * phi);
        }

        public static double MetersPerDegLon(double latDeg)
        {
            double phi = latDeg * Math.PI / 180.0;
            double v = 111412.84 * Math.Cos(phi)
                - 93.5 * Math.Cos(3.0 * phi)
                + 0.118 * Math.Cos(5.0 * phi);
            return v;
        }

        public static double Haversine(LatLon a, LatLon b)
        {
            double lat1 = a.Lat * Math.PI / 180.0;
            double lat2 = b.Lat * Math.PI / 180.0;
            double dLat = lat2 - lat1;
            double dLon = (b.Lon - a.Lon) * Math.PI / 180.0;
            double sLat = Math.Sin(dLat * 0.5);
            double sLon = Math.Sin(dLon * 0.5);
            double h = sLat * sLat + Math.Cos(lat1) * Math.Cos(lat2) * sLon * sLon;
            if (h > 1.0)
            {
                h = 1.0;
            }
            return 2.0 * EarthRadiusM * Math.Asin(Math.Sqrt(h));
        }

        public static double BearingDeg(LatLon from, LatLon to)
        {
            double lat1 = from.Lat * Math.PI / 180.0;
            double lat2 = to.Lat * Math.PI / 180.0;
            double dLon = (to.Lon - from.Lon) * Math.PI / 180.0;
            double y = Math.Sin(dLon) * Math.Cos(lat2);
            double x = Math.Cos(lat1) * Math.Sin(lat2) - Math.Sin(lat1) * Math.Cos(lat2) * Math.Cos(dLon);
            double deg = Math.Atan2(y, x) * 180.0 / Math.PI;
            if (deg < 0.0)
            {
                deg += 360.0;
            }
            return deg;
        }

        public static double NormalizeBearing(double deg)
        {
            double d = deg % 360.0;
            if (d < 0.0)
            {
                d += 360.0;
            }
            return d;
        }
    }

    public sealed class LocalFrame
    {
        public readonly LatLon Origin;
        private readonly double _metersPerDegLat;
        private readonly double _metersPerDegLon;

        public LocalFrame(LatLon origin)
        {
            Origin = origin;
            _metersPerDegLat = GeoMath.MetersPerDegLat(origin.Lat);
            _metersPerDegLon = GeoMath.MetersPerDegLon(origin.Lat);
        }

        public double MetersPerDegLat
        {
            get { return _metersPerDegLat; }
        }

        public double MetersPerDegLon
        {
            get { return _metersPerDegLon; }
        }

        public Vec2 ToLocal(LatLon p)
        {
            return new Vec2(
                (p.Lon - Origin.Lon) * _metersPerDegLon,
                (p.Lat - Origin.Lat) * _metersPerDegLat);
        }

        public LatLon ToGeo(Vec2 local)
        {
            return new LatLon(
                Origin.Lat + local.Y / _metersPerDegLat,
                Origin.Lon + local.X / _metersPerDegLon);
        }
    }
}
