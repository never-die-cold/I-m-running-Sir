using System.Collections.Generic;
using UnityEngine;
using CampusRun.Core;

namespace CampusRun.Unity
{
    public static class CampusRenderer
    {
        public const float ZGround = 1.0f;
        public const float ZRoad = 0.0f;
        public const float ZTrack = -0.2f;
        public const float ZBuilding = -0.6f;
        public const float ZMarker = -1.2f;
        public const float ZPlayer = -1.8f;

        public static readonly Color GroundColor = new Color(0.137f, 0.176f, 0.129f);
        public static readonly Color RoadColor = new Color(0.243f, 0.243f, 0.263f);
        public static readonly Color TrackColor = new Color(0.478f, 0.239f, 0.161f);
        public static readonly Color PathColor = new Color(0.290f, 0.278f, 0.239f);

        private static Material _unlitTemplate;

        public static Material CreateMaterial(Color color, string name)
        {
            if (_unlitTemplate == null)
            {
                Shader shader = Shader.Find("Unlit/Color");
                if (shader == null)
                {
                    shader = Shader.Find("Sprites/Default");
                }
                if (shader == null)
                {
                    shader = Shader.Find("Standard");
                }
                _unlitTemplate = new Material(shader);
                _unlitTemplate.name = "CampusUnlit";
            }

            Material m = new Material(_unlitTemplate);
            m.color = color;
            m.name = name;
            return m;
        }

        public static void Build(CampusLayout campus, WorldGeoMapper mapper)
        {
            GameObject root = new GameObject("CampusGeometry");

            BuildQuad(root.transform, "Ground", Center(campus), Extent(campus), GroundColor, ZGround);

            for (int i = 0; i < campus.Roads.Count; i++)
            {
                RoadDef road = campus.Roads[i];
                bool isTrack = road.Name != null && road.Name.Contains("跑道");
                double width = isTrack ? 9.0 : road.WidthMeters;
                Color color = isTrack ? TrackColor : RoadColor;
                float z = isTrack ? ZTrack : ZRoad;
                BuildRibbon(root.transform, road.Name, road.Points, width, road.Closed, color, z);
            }

            BuildRouteHighlight(root.transform, campus.MainRoute);

            for (int i = 0; i < campus.Buildings.Count; i++)
            {
                BuildingDef b = campus.Buildings[i];
                BuildQuad(root.transform, b.Name, b.Center, b.Size, BuildingColor(b.Kind), ZBuilding);
            }
        }

        public static Color BuildingColor(string kind)
        {
            switch (kind)
            {
                case "library": return new Color(0.325f, 0.353f, 0.463f);
                case "teach": return new Color(0.420f, 0.392f, 0.353f);
                case "canteen": return new Color(0.478f, 0.400f, 0.290f);
                case "dorm": return new Color(0.376f, 0.353f, 0.420f);
                case "gym": return new Color(0.302f, 0.424f, 0.392f);
                case "admin": return new Color(0.435f, 0.380f, 0.325f);
                case "lab": return new Color(0.353f, 0.400f, 0.435f);
                default: return new Color(0.400f, 0.400f, 0.400f);
            }
        }

        private static Vec2 Center(CampusLayout campus)
        {
            double minX = double.MaxValue;
            double minY = double.MaxValue;
            double maxX = double.MinValue;
            double maxY = double.MinValue;
            for (int i = 0; i < campus.Roads.Count; i++)
            {
                Vec2[] pts = campus.Roads[i].Points;
                for (int j = 0; j < pts.Length; j++)
                {
                    if (pts[j].X < minX) minX = pts[j].X;
                    if (pts[j].X > maxX) maxX = pts[j].X;
                    if (pts[j].Y < minY) minY = pts[j].Y;
                    if (pts[j].Y > maxY) maxY = pts[j].Y;
                }
            }
            return new Vec2((minX + maxX) * 0.5, (minY + maxY) * 0.5);
        }

        private static Vec2 Extent(CampusLayout campus)
        {
            double minX = double.MaxValue;
            double minY = double.MaxValue;
            double maxX = double.MinValue;
            double maxY = double.MinValue;
            for (int i = 0; i < campus.Roads.Count; i++)
            {
                Vec2[] pts = campus.Roads[i].Points;
                for (int j = 0; j < pts.Length; j++)
                {
                    if (pts[j].X < minX) minX = pts[j].X;
                    if (pts[j].X > maxX) maxX = pts[j].X;
                    if (pts[j].Y < minY) minY = pts[j].Y;
                    if (pts[j].Y > maxY) maxY = pts[j].Y;
                }
            }
            return new Vec2((maxX - minX) + 160.0, (maxY - minY) + 160.0);
        }

        private static void BuildQuad(Transform parent, string name, Vec2 center, Vec2 size, Color color, float z)
        {
            GameObject go = new GameObject(name);
            go.transform.SetParent(parent, false);

            float hx = (float)(size.X * 0.5);
            float hy = (float)(size.Y * 0.5);
            float cx = (float)center.X;
            float cy = (float)center.Y;

            Mesh mesh = new Mesh();
            mesh.name = name;
            mesh.vertices = new Vector3[]
            {
                new Vector3(cx - hx, cy - hy, z),
                new Vector3(cx + hx, cy - hy, z),
                new Vector3(cx + hx, cy + hy, z),
                new Vector3(cx - hx, cy + hy, z)
            };
            mesh.triangles = new int[] { 0, 2, 1, 0, 3, 2 };
            mesh.RecalculateBounds();

            MeshFilter mf = go.AddComponent<MeshFilter>();
            mf.sharedMesh = mesh;
            MeshRenderer mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = CreateMaterial(color, "mat_" + name);
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = false;
        }

        private static void BuildRibbon(Transform parent, string name, Vec2[] points, double width, bool closed, Color color, float z)
        {
            int n = points.Length;
            if (n < 2)
            {
                return;
            }

            if (closed && Vec2.Distance(points[0], points[n - 1]) > 1e-6)
            {
                Vec2[] ext = new Vec2[n + 1];
                System.Array.Copy(points, ext, n);
                ext[n] = points[0];
                points = ext;
                n = ext.Length;
            }

            float half = (float)(width * 0.5);
            List<Vector3> verts = new List<Vector3>(n * 2);
            List<int> tris = new List<int>((n - 1) * 6);

            for (int i = 0; i < n; i++)
            {
                Vec2 prev = points[i == 0 ? 0 : i - 1];
                Vec2 next = points[i == n - 1 ? n - 1 : i + 1];
                Vec2 tangent = (next - prev).Normalized();
                if (tangent.SqrLength < 1e-12)
                {
                    tangent = new Vec2(1.0, 0.0);
                }
                Vec2 normal = new Vec2(-tangent.Y, tangent.X);

                Vector3 a = new Vector3((float)(points[i].X + normal.X * half), (float)(points[i].Y + normal.Y * half), z);
                Vector3 b = new Vector3((float)(points[i].X - normal.X * half), (float)(points[i].Y - normal.Y * half), z);
                verts.Add(a);
                verts.Add(b);
            }

            for (int i = 0; i < n - 1; i++)
            {
                int v0 = i * 2;
                int v1 = i * 2 + 1;
                int v2 = (i + 1) * 2;
                int v3 = (i + 1) * 2 + 1;
                tris.Add(v0); tris.Add(v2); tris.Add(v1);
                tris.Add(v1); tris.Add(v2); tris.Add(v3);
            }

            GameObject go = new GameObject(name);
            go.transform.SetParent(parent, false);
            Mesh mesh = new Mesh();
            mesh.name = name;
            mesh.SetVertices(verts);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateBounds();

            MeshFilter mf = go.AddComponent<MeshFilter>();
            mf.sharedMesh = mesh;
            MeshRenderer mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = CreateMaterial(color, "mat_" + name);
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = false;
        }

        private static void BuildRouteHighlight(Transform parent, Polyline route)
        {
            if (route == null)
            {
                return;
            }

            GameObject go = new GameObject("SuggestedRoute");
            go.transform.SetParent(parent, false);
            LineRenderer lr = go.AddComponent<LineRenderer>();
            lr.useWorldSpace = true;
            lr.loop = route.IsClosed;
            lr.positionCount = route.PointCount;
            lr.startWidth = 1.6f;
            lr.endWidth = 1.6f;
            lr.numCapVertices = 2;
            lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            lr.receiveShadows = false;
            lr.material = CreateMaterial(PathColor, "mat_route");
            lr.startColor = PathColor;
            lr.endColor = PathColor;

            for (int i = 0; i < route.PointCount; i++)
            {
                Vec2 p = route[i];
                lr.SetPosition(i, new Vector3((float)p.X, (float)p.Y, ZTrack - 0.1f));
            }
        }

        public static GameObject CreateMarker(string name, Color color, float size, float z)
        {
            GameObject go = new GameObject(name);
            LineRenderer lr = go.AddComponent<LineRenderer>();
            lr.useWorldSpace = true;
            lr.loop = true;
            lr.positionCount = 24;
            lr.startWidth = 1.2f;
            lr.endWidth = 1.2f;
            lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            lr.receiveShadows = false;
            lr.material = CreateMaterial(color, "mat_" + name);
            lr.startColor = color;
            lr.endColor = color;

            for (int i = 0; i < 24; i++)
            {
                float ang = Mathf.PI * 2f * i / 24f;
                lr.SetPosition(i, new Vector3(Mathf.Cos(ang) * size, Mathf.Sin(ang) * size, z));
            }

            return go;
        }

        public static GameObject CreateDisc(string name, Color color, float radius, float z)
        {
            GameObject go = new GameObject(name);
            int segments = 28;
            Vector3[] verts = new Vector3[segments + 1];
            int[] tris = new int[segments * 3];
            verts[0] = new Vector3(0f, 0f, z);
            for (int i = 0; i < segments; i++)
            {
                float ang = Mathf.PI * 2f * i / segments;
                verts[i + 1] = new Vector3(Mathf.Cos(ang) * radius, Mathf.Sin(ang) * radius, z);
            }
            for (int i = 0; i < segments; i++)
            {
                tris[i * 3] = 0;
                tris[i * 3 + 1] = (i + 2 > segments ? 1 : i + 2);
                tris[i * 3 + 2] = i + 1;
            }

            Mesh mesh = new Mesh();
            mesh.name = name;
            mesh.vertices = verts;
            mesh.triangles = tris;
            mesh.RecalculateBounds();

            MeshFilter mf = go.AddComponent<MeshFilter>();
            mf.sharedMesh = mesh;
            MeshRenderer mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = CreateMaterial(color, "mat_" + name);
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = false;
            return go;
        }
    }
}
