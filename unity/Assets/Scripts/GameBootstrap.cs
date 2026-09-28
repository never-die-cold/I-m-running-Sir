using System.Collections.Generic;
using UnityEngine;
using CampusRun.Core;

namespace CampusRun.Unity
{
    public class GameBootstrap : MonoBehaviour
    {
        public static GameBootstrap Instance;

        public CampusLayout Campus;
        public WorldGeoMapper Mapper;
        public RunSession Session;
        public PlayerController Player;
        public MockLocationBridge Bridge;
        public GameHud Hud;

        public bool Autopilot;
        public float CameraSize = 60f;
        public double TargetSpeedMps = 2.94;

        private Camera _cam;
        private Vector3 _camVelocity;
        private readonly List<GameObject> _checkpointMarkers = new List<GameObject>();
        private readonly List<GameObject> _checkpointDots = new List<GameObject>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void AutoBoot()
        {
            if (Instance != null)
            {
                return;
            }
            GameObject go = new GameObject("CampusRunBootstrap");
            go.AddComponent<GameBootstrap>();
        }

        private void Awake()
        {
            Instance = this;

            Campus = CampusLayout.CreateSuzhou();
            Mapper = new WorldGeoMapper(Campus.Origin, 1.0);

            Session = new RunSession(Mapper, Campus, 20260924UL);
            Session.Route = Campus.MainRoute;
            Session.TargetSpeedMps = TargetSpeedMps;
            Session.FixIntervalSeconds = 1.0;
            Session.ResetToRouteStart();
            Session.SpawnCheckpoints();
            Session.StartRun();

            CampusRenderer.Build(Campus, Mapper);

            Player = PlayerController.Create(Session, this);
            Player.BaseSpeedMps = (float)TargetSpeedMps;

            CreateCamera();
            BuildCheckpointMarkers();

            Bridge = gameObject.AddComponent<MockLocationBridge>();
            Hud = gameObject.AddComponent<GameHud>();
            Hud.Bootstrap = this;
        }

        private void CreateCamera()
        {
            _cam = Camera.main;
            if (_cam == null)
            {
                GameObject camGo = new GameObject("MainCamera");
                camGo.tag = "MainCamera";
                _cam = camGo.AddComponent<Camera>();
                camGo.AddComponent<AudioListener>();
            }

            _cam.orthographic = true;
            _cam.orthographicSize = CameraSize;
            _cam.clearFlags = CameraClearFlags.SolidColor;
            _cam.backgroundColor = new Color(0.04f, 0.05f, 0.05f);
            _cam.transform.position = new Vector3(Player.transform.position.x, Player.transform.position.y, -10f);
            _cam.transform.rotation = Quaternion.identity;
        }

        private void BuildCheckpointMarkers()
        {
            for (int i = 0; i < Session.Checkpoints.Count; i++)
            {
                CheckpointDef cp = Session.Checkpoints[i];
                Vector3 pos = new Vector3((float)cp.LocalMeters.X, (float)cp.LocalMeters.Y, 0f);

                GameObject ring = CampusRenderer.CreateMarker(
                    "CheckpointRing" + i,
                    new Color(0.30f, 0.85f, 1f, 1f),
                    (float)cp.RadiusMeters,
                    CampusRenderer.ZMarker);
                ring.transform.position = pos;
                _checkpointMarkers.Add(ring);

                GameObject dot = CampusRenderer.CreateDisc(
                    "CheckpointDot" + i,
                    new Color(0.30f, 0.85f, 1f, 1f),
                    4f,
                    CampusRenderer.ZMarker - 0.05f);
                dot.transform.position = pos;
                _checkpointDots.Add(dot);
            }

            if (Session.Checkpoints.Count > 0)
            {
                Player.transform.position = new Vector3(Player.transform.position.x, Player.transform.position.y, CampusRenderer.ZPlayer);
            }
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            if (dt > 0.25f)
            {
                dt = 0.25f;
            }

            if (Input.GetKeyDown(KeyCode.Space))
            {
                Autopilot = !Autopilot;
            }
            if (Input.GetKeyDown(KeyCode.Equals) || Input.GetKeyDown(KeyCode.KeypadPlus) || Input.GetKeyDown(KeyCode.PageUp))
            {
                CameraSize -= 6f;
            }
            if (Input.GetKeyDown(KeyCode.Minus) || Input.GetKeyDown(KeyCode.KeypadMinus) || Input.GetKeyDown(KeyCode.PageDown))
            {
                CameraSize += 6f;
            }
            if (Input.GetKeyDown(KeyCode.R))
            {
                Session.ResetToRouteStart();
                Player.SyncToWorld();
                Autopilot = false;
            }
            CameraSize = Mathf.Clamp(CameraSize, 12f, 400f);

            long nowMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            if (Autopilot)
            {
                Session.TickAutopilot(dt, nowMs, TargetSpeedMps);
                Player.SyncToWorld();
            }

            UpdateCamera(dt);
            UpdateCheckpointVisuals();

            if (Bridge != null)
            {
                Bridge.Push(Session);
            }
        }

        private void UpdateCamera(float dt)
        {
            if (_cam == null)
            {
                return;
            }

            _cam.orthographicSize = Mathf.Lerp(_cam.orthographicSize, CameraSize, 1f - Mathf.Exp(-dt * 6f));

            Vector3 target = new Vector3(Player.transform.position.x, Player.transform.position.y, -10f);
            Vector3 lead = new Vector3((float)Session.WorldVelocity.X, (float)Session.WorldVelocity.Y, 0f) * 1.2f;
            target += lead;
            _cam.transform.position = Vector3.SmoothDamp(_cam.transform.position, target, ref _camVelocity, 0.25f);
            _cam.transform.rotation = Quaternion.identity;
        }

        private void UpdateCheckpointVisuals()
        {
            if (Session.Checkpoints == null)
            {
                return;
            }

            float pulse = 1f + 0.05f * Mathf.Sin(Time.time * 3f);

            for (int i = 0; i < _checkpointMarkers.Count && i < Session.Checkpoints.Count; i++)
            {
                CheckpointDef cp = Session.Checkpoints[i];
                GameObject ring = _checkpointMarkers[i];
                GameObject dot = _checkpointDots[i];

                if (cp.Cleared)
                {
                    if (ring.activeSelf)
                    {
                        ring.SetActive(false);
                    }
                    dot.SetActive(false);
                    continue;
                }

                ring.SetActive(true);
                dot.SetActive(true);
                ring.transform.localScale = new Vector3(pulse, pulse, 1f);
            }
        }
    }
}
