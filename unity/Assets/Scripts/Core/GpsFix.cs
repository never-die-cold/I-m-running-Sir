using System;
using System.Globalization;
using System.Text;

namespace CampusRun.Core
{
    public struct GpsFix
    {
        public double Lat;
        public double Lon;
        public long TimeMs;
        public long ElapsedRealtimeNanos;
        public double Accuracy;
        public double SpeedMps;
        public double BearingDeg;
        public double Altitude;
        public int Satellites;
        public string Provider;

        public static string F(double value, int decimals)
        {
            return value.ToString("F" + decimals.ToString(CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
        }

        public string ToJson()
        {
            StringBuilder sb = new StringBuilder(256);
            sb.Append('{');
            sb.Append("\"lat\":").Append(F(Lat, 7)).Append(',');
            sb.Append("\"lon\":").Append(F(Lon, 7)).Append(',');
            sb.Append("\"timeMs\":").Append(TimeMs.ToString(CultureInfo.InvariantCulture)).Append(',');
            sb.Append("\"elapsedRealtimeNanos\":").Append(ElapsedRealtimeNanos.ToString(CultureInfo.InvariantCulture)).Append(',');
            sb.Append("\"accuracy\":").Append(F(Accuracy, 2)).Append(',');
            sb.Append("\"speed\":").Append(F(SpeedMps, 3)).Append(',');
            sb.Append("\"bearing\":").Append(F(BearingDeg, 2)).Append(',');
            sb.Append("\"altitude\":").Append(F(Altitude, 2)).Append(',');
            sb.Append("\"satellites\":").Append(Satellites.ToString(CultureInfo.InvariantCulture)).Append(',');
            sb.Append("\"provider\":\"").Append(Provider ?? "gps").Append('"');
            sb.Append('}');
            return sb.ToString();
        }

        public override string ToString()
        {
            return Lat.ToString("F7", CultureInfo.InvariantCulture)
                + "," + Lon.ToString("F7", CultureInfo.InvariantCulture)
                + " spd=" + SpeedMps.ToString("F2", CultureInfo.InvariantCulture)
                + " acc=" + Accuracy.ToString("F1", CultureInfo.InvariantCulture);
        }
    }
}
