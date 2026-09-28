using System.Collections.Generic;
using UnityEngine;
using CampusRun.Core;

namespace CampusRun.Unity
{
    public sealed class MinimapProjection
    {
        public float Size;
        public float Scale;
        public float OffsetX;
        public float OffsetY;

        public static MinimapProjection Create(CampusLayout campus, int size, float margin)
        {
            float minX = float.MaxValue;
            float minY = float.MaxValue;
            float maxX = float.MinValue;
            float maxY = float.MinValue;

            for (int i = 0; i < campus.Roads.Count; i++)
            {
                Vec2[] pts = campus.Roads[i].Points;
                for (int j = 0; j < pts.Length; j++)
                {
                    if (pts[j].X < minX) minX = (float)pts[j].X;
                    if (pts[j].X > maxX) maxX = (float)pts[j].X;
                    if (pts[j].Y < minY) minY = (float)pts[j].Y;
                    if (pts[j].Y > maxY) maxY = (float)pts[j].Y;
                }
            }

            for (int i = 0; i < campus.Buildings.Count; i++)
            {
                BuildingDef b = campus.Buildings[i];
                float bx0 = (float)(b.Center.X - b.Size.X * 0.5);
                float bx1 = (float)(b.Center.X + b.Size.X * 0.5);
                float by0 = (float)(b.Center.Y - b.Size.Y * 0.5);
                float by1 = (float)(b.Center.Y + b.Size.Y * 0.5);
                if (bx0 < minX) minX = bx0;
                if (bx1 > maxX) maxX = bx1;
                if (by0 < minY) minY = by0;
                if (by1 > maxY) maxY = by1;
            }

            float margin2 = margin;
            minX -= margin2;
            minY -= margin2;
            maxX += margin2;
            maxY += margin2;

            float spanX = Mathf.Max(1f, maxX - minX);
            float spanY = Mathf.Max(1f, maxY - minY);

            MinimapProjection p = new MinimapProjection();
            p.Size = size;
            p.Scale = (size - 2f * margin) / Mathf.Max(spanX, spanY);
            p.OffsetX = size * 0.5f - (minX + spanX * 0.5f) * p.Scale;
            p.OffsetY = size * 0.5f - (minY + spanY * 0.5f) * p.Scale;
            return p;
        }

        public Vector2 ToGui(Vec2 world)
        {
            float fx = (float)world.X * Scale + OffsetX;
            float fy = (float)world.Y * Scale + OffsetY;
            return new Vector2(fx, Size - fy);
        }

        public int ToTexRow(float worldY)
        {
            float fy = worldY * Scale + OffsetY;
            int row = Mathf.RoundToInt(Size - 1f - fy);
            return Mathf.Clamp(row, 0, (int)Size - 1);
        }

        public int ToTexCol(float worldX)
        {
            int col = Mathf.RoundToInt(worldX * Scale + OffsetX);
            return Mathf.Clamp(col, 0, (int)Size - 1);
        }
    }

    public static class Minimap
    {
        public static Texture2D Build(CampusLayout campus, MinimapProjection proj)
        {
            int size = (int)proj.Size;
            Color32 bg = new Color32(18, 22, 17, 255);
            Color32 road = new Color32(74, 76, 82, 255);
            Color32 track = new Color32(140, 74, 50, 255);
            Color32 building = new Color32(96, 100, 116, 255);
            Color32 route = new Color32(232, 196, 92, 255);

            Color32[] px = new Color32[size * size];
            for (int i = 0; i < px.Length; i++)
            {
                px[i] = bg;
            }

            for (int i = 0; i < campus.Roads.Count; i++)
            {
                RoadDef r = campus.Roads[i];
                bool isTrack = r.Name != null && r.Name.Contains("跑道");
                float halfWidth = (float)((isTrack ? 9.0 : r.WidthMeters) * 0.5) * proj.Scale;
                float radius = Mathf.Max(1.2f, halfWidth);
                Color32 color = isTrack ? track : road;
                StampPolyline(px, size, proj, r.Points, r.Closed, radius, color);

            }

            if (campus.MainRoute != null)
            {
                StampPolyline(px, size, proj, campus.MainRoute.Points, false, 1.0f, route);
            }

            for (int i = 0; i < campus.Buildings.Count; i++)
            {
                BuildingDef b = campus.Buildings[i];
                float x0 = (float)(b.Center.X - b.Size.X * 0.5);
                float x1 = (float)(b.Center.X + b.Size.X * 0.5);
                float y0 = (float)(b.Center.Y - b.Size.Y * 0.5);
                float y1 = (float)(b.Center.Y + b.Size.Y * 0.5);
                int c0 = proj.ToTexCol(x0);
                int c1 = proj.ToTexCol(x1);
                int r0 = proj.ToTexRow(y0);
                int r1 = proj.ToTexRow(y1);
                if (r0 > r1)
                {
                    int t = r0;
                    r0 = r1;
                    r1 = t;
                }
                for (int row = r0; row <= r1; row++)
                {
                    for (int col = c0; col <= c1; col++)
                    {
                        px[row * size + col] = building;
                    }
                }
            }

            Texture2D tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            tex.name = "CampusMinimap";
            tex.filterMode = FilterMode.Point;
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.SetPixels32(px);
            tex.Apply();
            return tex;
        }

        private static void StampPolyline(Color32[] px, int size, MinimapProjection proj, Vec2[] points, bool floor, float radius, Color32 color)
        {
            int n = points.Length;
            if (n < 2)
            {
                return;
            }

            if (floor && Vec2.Distance(points[0], points[n - 1]) > 1e-6)
            {
                Vec2[] ext = new Vec2[n + 1];
                System.Array.Copy(points, ext, n);
                ext[n] = points[0];
                points = ext;
                n = ext.Length;
            }

            for (int i = 0; i < n - 1; i++)
            {
                Vector2 a = proj.ToGui(points[i]);
                Vector2 b = proj.ToGui(points[i + 1]);
                float len = Vector2.Distance(a, b);
                int steps = Mathf.Max(1, Mathf.CeilToInt(len / 0.75f));
                for (int s = 0; s <= steps; s++)
                {
                    Vector2 p = Vector2.Lerp(a, b, (float)s / steps);
                    StampCircle(px, size, p.x, p.y, radius, color);
                }
            }
        }

        private static void StampCircle(Color32[] px, int size, float cx, float cy, float radius, Color32 color)
        {
            int r = Mathf.CeilToInt(radius);
            int x0 = Mathf.RoundToInt(cx);
            int y0 = Mathf.RoundToInt(cy);
            for (int dy = -r; dy <= r; dy++)
            {
                for (int dx = -r; dx <= r; dx++)
                {
                    if (dx * dx + dy * dy > radius * radius + 0.25f)
                    {
                        continue;
                    }
                    int x = x0 + dx;
                    int y = y0 + dy;
                    if (x < 0 || y < 0 || x >= size || y >= size)
                    {
                        continue;
                    }
                    px[y * size + x] = color;
                }
            }
        }
    }
}
