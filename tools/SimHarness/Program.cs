using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using CampusRun.Core;

namespace CampusRun.SimHarness
{
    internal static class Program
    {
        private const double TickSeconds = 1.0;

        private static int Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;

            double targetKm = 2.5;
            double targetPaceSecPerKm = 340.0;
            ulong seed = 20260924UL;

            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "--km")
                {
                    double.TryParse(args[i + 1], NumberStyles.Float, CultureInfo.InvariantCulture, out targetKm);
                }
                else if (args[i] == "--pace")
                {
                    double.TryParse(args[i + 1], NumberStyles.Float, CultureInfo.InvariantCulture, out targetPaceSecPerKm);
                }
                else if (args[i] == "--seed")
                {
                    ulong.TryParse(args[i + 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out seed);
                }
            }

            if (targetKm <= 0.05)
            {
                targetKm = 0.05;
            }

            double targetSpeedMps = 1000.0 / targetPaceSecPerKm;

            CampusLayout campus = CampusLayout.CreateSuzhou();
            WorldGeoMapper mapper = new WorldGeoMapper(campus.Origin, 1.0);
            RunSession session = new RunSession(mapper, campus, seed);
            session.TargetSpeedMps = targetSpeedMps;
            session.Feed.MinPaceSecPerKm = 180.0;
            session.Feed.MaxPaceSecPerKm = 540.0;
            session.Feed.JitterAmplitudeMeters = 3.0;
            session.Feed.JitterCorrelationSeconds = 12.0;
            session.Feed.AccuracyMinMeters = 5.0;
            session.Feed.AccuracyMaxMeters = 13.0;
            session.Route = campus.TrackLoop;
            session.ResetToRouteStart();
            session.SpawnCheckpoints();
            session.StartRun();

            PrintHeader(campus, mapper, session, targetKm, targetPaceSecPerKm);

            List<GpsFix> fixes = new List<GpsFix>(8192);
            List<double> stepDistances = new List<double>(8192);

            LatLon previous = default(LatLon);
            bool hasPrevious = false;
            double maxStep = 0.0;
            double minStep = double.MaxValue;
            double lastPrintSecond = -1.0;

            int guard = 0;
            while (session.RecordedDistanceMeters < targetKm * 1000.0 && guard < 60000)
            {
                guard++;
                GpsFix fix = session.TickAutopilot(TickSeconds, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), targetSpeedMps);
                fixes.Add(fix);

                if (hasPrevious)
                {
                    double step = GeoMath.Haversine(previous, new LatLon(fix.Lat, fix.Lon));
                    stepDistances.Add(step);
                    if (step > maxStep)
                    {
                        maxStep = step;
                    }
                    if (step < minStep)
                    {
                        minStep = step;
                    }
                }

                previous = new LatLon(fix.Lat, fix.Lon);
                hasPrevious = true;

                if (session.DurationSeconds - lastPrintSecond >= 60.0)
                {
                    lastPrintSecond = session.DurationSeconds;
                    PrintProgress(session, fix);
                }
            }

            session.StopRun();
            PrintReport(session, fixes, stepDistances, maxStep, minStep, targetKm);

            string outDir = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "out");
            outDir = Path.GetFullPath(outDir);
            Directory.CreateDirectory(outDir);

            WriteTraceCsv(Path.Combine(outDir, "trace.csv"), fixes);
            WriteEnvelopeSample(Path.Combine(outDir, "lpr_route.sample.json"), session);
            WriteNmeaStyleTrack(Path.Combine(outDir, "track.json"), fixes);

            Console.WriteLine();
            Console.WriteLine("输出文件:");
            Console.WriteLine("  " + Path.Combine(outDir, "trace.csv"));
            Console.WriteLine("  " + Path.Combine(outDir, "lpr_route.sample.json"));
            Console.WriteLine("  " + Path.Combine(outDir, "track.json"));
            Console.WriteLine();

            return 0;
        }

        private static void PrintHeader(CampusLayout campus, WorldGeoMapper mapper, RunSession session, double targetKm, double paceSecPerKm)
        {
            Console.WriteLine();
            Console.WriteLine("========================================================");
            Console.WriteLine(" 校园跑 Demo  ·  坐标流仿真验证");
            Console.WriteLine("========================================================");
            Console.WriteLine(" 校园       : " + campus.Name);
            Console.WriteLine(" 原点坐标   : " + campus.Origin);
            Console.WriteLine(" 米/纬度     : " + mapper.Frame.MetersPerDegLat.ToString("F2", CultureInfo.InvariantCulture));
            Console.WriteLine(" 米/经度     : " + mapper.Frame.MetersPerDegLon.ToString("F2", CultureInfo.InvariantCulture));
            Console.WriteLine(" 路线       : 操场跑道 " + session.Route.TotalLength.ToString("F1", CultureInfo.InvariantCulture) + " m (闭环)");
            Console.WriteLine(" 目标里程   : " + targetKm.ToString("F2", CultureInfo.InvariantCulture) + " km");
            Console.WriteLine(" 目标配速   : " + PaceController.FormatPace(paceSecPerKm) + " /km");
            Console.WriteLine(" 打卡点数   : " + session.Checkpoints.Count + "  (半径 " + session.CheckpointRadiusMeters.ToString("F0", CultureInfo.InvariantCulture) + " m)");
            Console.WriteLine(" 采样率     : 1 Hz");
            Console.WriteLine("========================================================");
            Console.WriteLine();
            Console.WriteLine(" 时间     里程(记录)  配速      速度    精度   卫星  打卡");
            Console.WriteLine(" ------  ----------  --------  ------  -----  ----  ----");

            for (int i = 0; i < session.Checkpoints.Count; i++)
            {
                CheckpointDef cp = session.Checkpoints[i];
                Console.WriteLine("   打卡点#" + (i + 1) + "  路线 " + cp.RouteDistance.ToString("F0", CultureInfo.InvariantCulture)
                    + " m  ->  " + cp.ToGeo(mapper.Frame).ToString());
            }
            Console.WriteLine();
        }

        private static void PrintProgress(RunSession session, GpsFix fix)
        {
            Console.WriteLine(
                " " + PaceController.FormatDuration(session.DurationSeconds).PadLeft(6)
                + "  " + (session.RecordedDistanceMeters / 1000.0).ToString("F3", CultureInfo.InvariantCulture).PadLeft(9) + "k"
                + "  " + PaceController.FormatPace(PaceController.SpeedToPaceSecPerKm(fix.SpeedMps)).PadLeft(8)
                + "  " + fix.SpeedMps.ToString("F2", CultureInfo.InvariantCulture).PadLeft(6)
                + "  " + fix.Accuracy.ToString("F1", CultureInfo.InvariantCulture).PadLeft(5)
                + "  " + fix.Satellites.ToString(CultureInfo.InvariantCulture).PadLeft(4)
                + "  " + (session.ClearedCheckpointCount + "/" + session.Checkpoints.Count).PadLeft(4));
        }

        private static void PrintReport(RunSession session, List<GpsFix> fixes, List<double> steps, double maxStep, double minStep, double targetKm)
        {
            Console.WriteLine();
            Console.WriteLine("===================== 验证报告 =====================");

            double totalTime = session.DurationSeconds;
            double recordedKm = session.RecordedDistanceMeters / 1000.0;
            double trueKm = session.TrueDistanceMeters / 1000.0;
            double avgPace = PaceController.SpeedToPaceSecPerKm(session.RecordedDistanceMeters / Math.Max(1e-6, totalTime));

            double minPace = double.MaxValue;
            double maxPace = 0.0;
            double sumSpeed = 0.0;
            double minAcc = double.MaxValue;
            double maxAcc = 0.0;
            int movedSamples = 0;
            int outOfBandSamples = 0;

            for (int i = 0; i < fixes.Count; i++)
            {
                GpsFix f = fixes[i];
                if (f.SpeedMps > 0.3)
                {
                    double pace = PaceController.SpeedToPaceSecPerKm(f.SpeedMps);
                    if (pace < minPace)
                    {
                        minPace = pace;
                    }
                    if (pace > maxPace)
                    {
                        maxPace = pace;
                    }
                    if (pace < session.Feed.MinPaceSecPerKm - 1.0 || pace > session.Feed.MaxPaceSecPerKm + 1.0)
                    {
                        outOfBandSamples++;
                    }
                    sumSpeed += f.SpeedMps;
                    movedSamples++;
                }
                if (f.Accuracy < minAcc)
                {
                    minAcc = f.Accuracy;
                }
                if (f.Accuracy > maxAcc)
                {
                    maxAcc = f.Accuracy;
                }
            }

            double meanStep = 0.0;
            for (int i = 0; i < steps.Count; i++)
            {
                meanStep += steps[i];
            }
            meanStep = steps.Count > 0 ? meanStep / steps.Count : 0.0;

            double stdStep = 0.0;
            for (int i = 0; i < steps.Count; i++)
            {
                double d = steps[i] - meanStep;
                stdStep += d * d;
            }
            stdStep = steps.Count > 1 ? Math.Sqrt(stdStep / (steps.Count - 1)) : 0.0;

            Console.WriteLine();
            Console.WriteLine(" [里程]");
            Console.WriteLine("   记录里程 (App侧) : " + recordedKm.ToString("F3", CultureInfo.InvariantCulture) + " km");
            Console.WriteLine("   真实里程 (轨迹)   : " + trueKm.ToString("F3", CultureInfo.InvariantCulture) + " km");
            Console.WriteLine("   抖动引入偏差      : " + ((recordedKm - trueKm) / Math.Max(1e-9, trueKm) * 100.0).ToString("F2", CultureInfo.InvariantCulture) + " %");
            Console.WriteLine("   目标里程          : " + targetKm.ToString("F2", CultureInfo.InvariantCulture) + " km");
            Console.WriteLine();
            Console.WriteLine(" [配速]     合法性要求: 3'00\" ~ 9'00\" /km");
            Console.WriteLine("   平均配速 : " + PaceController.FormatPace(avgPace) + "   状态: " + session.AveragePaceStatus.ToString());
            Console.WriteLine("   最快配速 : " + PaceController.FormatPace(minPace));
            Console.WriteLine("   最慢配速 : " + PaceController.FormatPace(maxPace));
            Console.WriteLine("   平均速度 : " + (sumSpeed / Math.Max(1, movedSamples)).ToString("F3", CultureInfo.InvariantCulture) + " m/s");
            Console.WriteLine("   越界采样 : " + outOfBandSamples.ToString(CultureInfo.InvariantCulture) + " / " + movedSamples.ToString(CultureInfo.InvariantCulture));
            Console.WriteLine();
            Console.WriteLine(" [轨迹自然度]");
            Console.WriteLine("   单步位移 均值     : " + meanStep.ToString("F3", CultureInfo.InvariantCulture) + " m");
            Console.WriteLine("   单步位移 标准差   : " + stdStep.ToString("F3", CultureInfo.InvariantCulture) + " m");
            Console.WriteLine("   单步位移 最大     : " + maxStep.ToString("F3", CultureInfo.InvariantCulture) + " m");
            Console.WriteLine("   单步位移 最小     : " + minStep.ToString("F3", CultureInfo.InvariantCulture) + " m");
            Console.WriteLine();
            Console.WriteLine(" [GPS 质量]");
            Console.WriteLine("   精度范围 : " + minAcc.ToString("F1", CultureInfo.InvariantCulture) + " ~ " + maxAcc.ToString("F1", CultureInfo.InvariantCulture) + " m");
            Console.WriteLine("   总采样点 : " + fixes.Count.ToString(CultureInfo.InvariantCulture));
            Console.WriteLine();
            Console.WriteLine(" [打卡点]");
            Console.WriteLine("   已打卡   : " + session.ClearedCheckpointCount + " / " + session.Checkpoints.Count);
            for (int i = 0; i < session.Checkpoints.Count; i++)
            {
                Console.WriteLine("      #" + (i + 1) + " 路线 " + session.Checkpoints[i].RouteDistance.ToString("F0", CultureInfo.InvariantCulture).PadLeft(6) + " m  "
                    + (session.Checkpoints[i].Cleared ? "已打卡" : "未打卡"));
            }
            Console.WriteLine();
            Console.WriteLine(" [逐项判定]");
            Check("平均配速落在合法区间", session.AveragePaceStatus == PaceStatus.Ok);
            Check("瞬时配速不越界 (移动中)", outOfBandSamples == 0);
            Check("无瞬移 (单步 < 8m)", maxStep < 8.0);
            Check("单步位移非恒定 (有噪声特征)", stdStep > 0.05);
            Check("单步位移波动真实 (CV 5%~40%)", stdStep / Math.Max(1e-9, meanStep) > 0.05 && stdStep / Math.Max(1e-9, meanStep) < 0.40);
            Check("里程偏差可控 (< 10%)", Math.Abs(recordedKm - trueKm) / Math.Max(1e-9, trueKm) < 0.10);
            Check("首个打卡点不在起点", session.Checkpoints.Count == 0 || session.Checkpoints[0].RouteDistance > 30.0);
            Check("全部打卡点可达", session.ClearedCheckpointCount == session.Checkpoints.Count);
            Check("采样点数量合理", fixes.Count > 100);
            Console.WriteLine("====================================================");
            Console.WriteLine();
            Console.WriteLine(" 写入 /data/local/tmp/lpr_route.json 的最后一帧:");
            Console.WriteLine(" " + session.LastEnvelopeJson);
        }

        private static void Check(string label, bool passed)
        {
            Console.WriteLine("   [" + (passed ? "PASS" : "FAIL") + "] " + label);
        }

        private static void WriteTraceCsv(string path, List<GpsFix> fixes)
        {
            StringBuilder sb = new StringBuilder(fixes.Count * 80);
            sb.AppendLine("idx,timeMs,elapsedNanos,lat,lon,accuracy,speed,bearing,altitude,satellites");
            for (int i = 0; i < fixes.Count; i++)
            {
                GpsFix f = fixes[i];
                sb.Append(i.ToString(CultureInfo.InvariantCulture)).Append(',');
                sb.Append(f.TimeMs.ToString(CultureInfo.InvariantCulture)).Append(',');
                sb.Append(f.ElapsedRealtimeNanos.ToString(CultureInfo.InvariantCulture)).Append(',');
                sb.Append(f.Lat.ToString("F7", CultureInfo.InvariantCulture)).Append(',');
                sb.Append(f.Lon.ToString("F7", CultureInfo.InvariantCulture)).Append(',');
                sb.Append(f.Accuracy.ToString("F2", CultureInfo.InvariantCulture)).Append(',');
                sb.Append(f.SpeedMps.ToString("F3", CultureInfo.InvariantCulture)).Append(',');
                sb.Append(f.BearingDeg.ToString("F2", CultureInfo.InvariantCulture)).Append(',');
                sb.Append(f.Altitude.ToString("F2", CultureInfo.InvariantCulture)).Append(',');
                sb.Append(f.Satellites.ToString(CultureInfo.InvariantCulture));
                sb.AppendLine();
            }
            File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
        }

        private static void WriteEnvelopeSample(string path, RunSession session)
        {
            File.WriteAllText(path, session.LastEnvelopeJson, new UTF8Encoding(false));
        }

        private static void WriteNmeaStyleTrack(string path, List<GpsFix> fixes)
        {
            StringBuilder sb = new StringBuilder(fixes.Count * 40);
            sb.Append("[");
            int stride = Math.Max(1, fixes.Count / 400);
            bool first = true;
            for (int i = 0; i < fixes.Count; i += stride)
            {
                if (!first)
                {
                    sb.Append(',');
                }
                first = false;
                sb.Append('[').Append(fixes[i].Lat.ToString("F6", CultureInfo.InvariantCulture)).Append(',')
                    .Append(fixes[i].Lon.ToString("F6", CultureInfo.InvariantCulture)).Append(']');
            }
            sb.Append("]");
            File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
        }
    }
}
