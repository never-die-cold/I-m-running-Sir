using System.Globalization;
using UnityEngine;
using CampusRun.Core;

namespace CampusRun.Unity
{
    public class GameHud : MonoBehaviour
    {
        public GameBootstrap Bootstrap;
        public int MinimapSize = 190;

        private Texture2D _minimapTex;
        private MinimapProjection _proj;
        private GUIStyle _title;
        private GUIStyle _label;
        private GUIStyle _value;
        private GUIStyle _hint;

        private static readonly Color Accent = new Color(0.98f, 0.78f, 0.22f, 1f);
        private static readonly Color Good = new Color(0.45f, 0.92f, 0.50f, 1f);
        private static readonly Color Bad = new Color(1f, 0.42f, 0.35f, 1f);
        private static readonly Color Warn = new Color(1f, 0.72f, 0.30f, 1f);
        private static readonly Color Dim = new Color(0.68f, 0.70f, 0.68f, 1f);

        private void EnsureStyles()
        {
            if (_title != null)
            {
                return;
            }

            _title = new GUIStyle(GUI.skin.label);
            _title.fontSize = 12;
            _title.fontStyle = FontStyle.Bold;
            _title.normal.textColor = Accent;

            _label = new GUIStyle(GUI.skin.label);
            _label.fontSize = 12;
            _label.normal.textColor = Dim;

            _value = new GUIStyle(GUI.skin.label);
            _value.fontSize = 13;
            _value.fontStyle = FontStyle.Bold;
            _value.normal.textColor = Color.white;

            _hint = new GUIStyle(GUI.skin.label);
            _hint.fontSize = 12;
            _hint.normal.textColor = Dim;
        }

        private void EnsureMinimap()
        {
            if (_minimapTex != null)
            {
                return;
            }
            if (Bootstrap == null)
            {
                Bootstrap = GameBootstrap.Instance;
            }
            if (Bootstrap == null || Bootstrap.Campus == null)
            {
                return;
            }

            _proj = MinimapProjection.Create(Bootstrap.Campus, MinimapSize, 12f);
            _minimapTex = Minimap.Build(Bootstrap.Campus, _proj);
        }

        private void OnGUI()
        {
            EnsureStyles();
            EnsureMinimap();

            if (Bootstrap == null)
            {
                Bootstrap = GameBootstrap.Instance;
            }
            if (Bootstrap == null || Bootstrap.Session == null)
            {
                return;
            }

            RunSession s = Bootstrap.Session;
            float w = Screen.width;
            float h = Screen.height;

            DrawMainPanel(s);
            DrawGpsPanel(s, w);
            DrawCheckpointPanel(s, w);
            DrawHintBar(s, w, h);
            DrawMinimap(s, w, h);
        }

        private void DrawMainPanel(RunSession s)
        {
            Rect r = new Rect(10f, 10f, 296f, 142f);
            Panel(r, "CAMPUS RUN  /  RUN SESSION");

            Row(r, 26f, "DISTANCE", (s.RecordedDistanceMeters / 1000.0).ToString("F3", CultureInfo.InvariantCulture) + " km", Color.white);
            Row(r, 48f, "PACE", PaceController.FormatPace(PaceController.SpeedToPaceSecPerKm(s.Feed.SmoothedSpeedMps)) + " /km", Color.white);
            Row(r, 70f, "TIME", PaceController.FormatDuration(s.DurationSeconds), Color.white);
            Row(r, 92f, "SPEED", s.Feed.SmoothedSpeedMps.ToString("F2", CultureInfo.InvariantCulture) + " m/s", Color.white);

            Color statusColor = StatusColor(s.AveragePaceStatus);
            Row(r, 114f, "AVG PACE", PaceController.FormatPace(s.RecordedAveragePaceSecPerKm) + "   " + StatusText(s.AveragePaceStatus), statusColor);
        }

        private void DrawGpsPanel(RunSession s, float w)
        {
            Rect r = new Rect(w - 306f, 10f, 296f, 164f);
            Panel(r, "GPS FEED  ->  lpr_route.json");

            GpsFix f = s.LastFix;
            Row(r, 26f, "LAT", f.Lat.ToString("F7", CultureInfo.InvariantCulture), Color.white);
            Row(r, 48f, "LON", f.Lon.ToString("F7", CultureInfo.InvariantCulture), Color.white);
            Row(r, 70f, "ACCURACY", f.Accuracy.ToString("F1", CultureInfo.InvariantCulture) + " m", Color.white);
            Row(r, 92f, "SATELLITES", f.Satellites.ToString(CultureInfo.InvariantCulture), Color.white);
            Row(r, 114f, "BEARING", f.BearingDeg.ToString("F1", CultureInfo.InvariantCulture) + " deg", Color.white);
            Row(r, 136f, "FIX #", s.FixCount.ToString(CultureInfo.InvariantCulture) + "  @1Hz", Color.white);
        }

        private void DrawCheckpointPanel(RunSession s, float w)
        {
            Rect r = new Rect(w * 0.5f - 118f, 10f, 236f, 62f);
            Panel(r, "CHECKPOINTS  (walk into the ring)");

            string text = s.ClearedCheckpointCount + " / " + s.Checkpoints.Count + " cleared";
            GUI.Label(new Rect(r.x + 10f, r.y + 28f, r.width - 20f, 24f), text, _value);

            float sw = (r.width - 20f) * (s.Checkpoints.Count > 0 ? (float)s.ClearedCheckpointCount / s.Checkpoints.Count : 0f);
            GuiDraw.Rect_(new Rect(r.x + 10f, r.y + 50f, r.width - 20f, 4f), new Color(1f, 1f, 1f, 0.15f));
            GuiDraw.Rect_(new Rect(r.x + 10f, r.y + 50f, sw, 4f), Good);
        }

        private void DrawHintBar(RunSession s, float w, float h)
        {
            string mode = Bootstrap.Autopilot ? "AUTOPILOT ON" : "MANUAL";
            string hint = mode
                + "   |   WASD / drag left half to move   |   SPACE autopilot   |   +/- zoom   |   R reset"
                + "   |   " + Bootstrap.Bridge.Status;

            GUI.Label(new Rect(14f, h - 26f, w - 220f, 20f), hint, _hint);
        }

        private void DrawMinimap(RunSession s, float w, float h)
        {
            if (_minimapTex == null || _proj == null)
            {
                return;
            }

            Rect r = new Rect(w - MinimapSize - 12f, h - MinimapSize - 34f, MinimapSize, MinimapSize);
            GuiDraw.Rect_(new Rect(r.x - 3f, r.y - 3f, r.width + 6f, r.height + 6f), new Color(0.98f, 0.78f, 0.22f, 0.60f));
            GuiDraw.Rect_(r, new Color(0.07f, 0.09f, 0.07f, 1f));
            GUI.DrawTexture(r, _minimapTex);

            for (int i = 0; i < s.Checkpoints.Count; i++)
            {
                CheckpointDef cp = s.Checkpoints[i];
                Vector2 lp = _proj.ToGui(cp.LocalMeters);
                Vector2 gp = new Vector2(r.x + lp.x, r.y + lp.y);

                float ringRadius = Mathf.Max(3f, (float)cp.RadiusMeters * _proj.Scale);
                Color c = cp.Cleared
                    ? new Color(0.55f, 0.57f, 0.55f, 0.85f)
                    : new Color(0.30f, 0.85f, 1f, 1f);

                GuiDraw.Ring(gp, ringRadius, new Color(c.r, c.g, c.b, 0.35f), 1f);
                GuiDraw.Disc(gp, 3f, c);
            }

            Vector2 pp = _proj.ToGui(s.WorldPosition);
            Vector2 pgp = new Vector2(r.x + pp.x, r.y + pp.y);
            GuiDraw.Disc(pgp, 5f, new Color(1f, 0.95f, 0.75f, 1f));
            GuiDraw.Disc(pgp, 3f, Accent);
        }

        private void Panel(Rect r, string title)
        {
            GuiDraw.Rect_(r, new Color(0f, 0f, 0f, 0.64f));
            GuiDraw.Rect_(new Rect(r.x, r.y, 3f, r.height), Accent);
            GUI.Label(new Rect(r.x + 10f, r.y + 4f, r.width - 16f, 18f), title, _title);
        }

        private void Row(Rect panel, float y, string key, string value, Color valueColor)
        {
            GUI.Label(new Rect(panel.x + 10f, panel.y + y, 96f, 20f), key, _label);
            Color prev = _value.normal.textColor;
            _value.normal.textColor = valueColor;
            GUI.Label(new Rect(panel.x + 104f, panel.y + y, panel.width - 114f, 20f), value, _value);
            _value.normal.textColor = prev;
        }

        private static Color StatusColor(PaceStatus status)
        {
            switch (status)
            {
                case PaceStatus.Ok: return Good;
                case PaceStatus.TooSlow: return Bad;
                case PaceStatus.TooFast: return Warn;
                default: return Dim;
            }
        }

        private static string StatusText(PaceStatus status)
        {
            switch (status)
            {
                case PaceStatus.Ok: return "OK";
                case PaceStatus.TooSlow: return "TOO SLOW";
                case PaceStatus.TooFast: return "TOO FAST";
                default: return "--";
            }
        }
    }
}
