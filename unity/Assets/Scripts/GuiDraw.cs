using UnityEngine;

namespace CampusRun.Unity
{
    public static class GuiDraw
    {
        private static Texture2D _white;

        public static Texture2D White()
        {
            if (_white == null)
            {
                _white = new Texture2D(1, 1);
                _white.SetPixel(0, 0, Color.white);
                _white.Apply();
                _white.hideFlags = HideFlags.HideAndDontSave;
            }
            return _white;
        }

        public static void Rect_(Rect r, Color color)
        {
            Color prev = GUI.color;
            GUI.color = color;
            GUI.DrawTexture(r, White());
            GUI.color = prev;
        }

        public static void Disc(Vector2 center, float radius, Color color)
        {
            Rect_(new Rect(center.x - radius, center.y - radius, radius * 2f, radius * 2f), color);
        }

        public static void Line(Vector2 a, Vector2 b, Color color, float thickness)
        {
            Vector2 delta = b - a;
            float len = delta.magnitude;
            if (len < 0.01f)
            {
                return;
            }

            float angle = Mathf.Atan2(delta.y, delta.x) * Mathf.Rad2Deg;
            Matrix4x4 saved = GUI.matrix;
            Color prev = GUI.color;
            GUI.color = color;
            GUIUtility.RotateAroundPivot(angle, a);
            GUI.DrawTexture(new Rect(a.x, a.y - thickness * 0.5f, len, thickness), White());
            GUI.matrix = saved;
            GUI.color = prev;
        }

        public static void Ring(Vector2 center, float radius, Color color, float thickness)
        {
            int steps = Mathf.Clamp(Mathf.RoundToInt(radius), 16, 64);
            Vector2 prev = new Vector2(center.x + radius, center.y);
            for (int i = 1; i <= steps; i++)
            {
                float a = Mathf.PI * 2f * i / steps;
                Vector2 cur = new Vector2(center.x + Mathf.Cos(a) * radius, center.y + Mathf.Sin(a) * radius);
                Line(prev, cur, color, thickness);
                prev = cur;
            }
        }

        public static void StripedDisc(Vector2 center, float radius, Color color)
        {
            Disc(center, radius, color);
        }
    }
}
