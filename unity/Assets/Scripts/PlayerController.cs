using UnityEngine;
using CampusRun.Core;

namespace CampusRun.Unity
{
    public class PlayerController : MonoBehaviour
    {
        public float BaseSpeedMps = 2.94f;
        public bool InputEnabled = true;

        private RunSession _session;
        private GameBootstrap _boot;
        private Transform _body;
        private Transform _nose;

        private int _fingerId = -1;
        private Vector2 _touchOrigin;
        private Vector2 _joyValue;
        private bool _hasInput;
        private Vector2 _facing = new Vector2(0f, -1f);

        public Vector2 JoyValue
        {
            get { return _joyValue; }
        }

        public bool HasInput
        {
            get { return _hasInput; }
        }

        public Vector2 Facing
        {
            get { return _facing; }
        }

        public static PlayerController Create(RunSession session, GameBootstrap boot)
        {
            GameObject go = new GameObject("Player");
            PlayerController pc = go.AddComponent<PlayerController>();
            pc._session = session;
            pc._boot = boot;

            GameObject body = CampusRenderer.CreateDisc("Body", new Color(0.98f, 0.78f, 0.22f), 3.2f, 0f);
            body.transform.SetParent(go.transform, false);
            pc._body = body.transform;

            GameObject nose = CampusRenderer.CreateDisc("Nose", new Color(0.20f, 0.18f, 0.10f), 1.2f, -0.1f);
            nose.transform.SetParent(go.transform, false);
            pc._nose = nose.transform;

            pc.SyncToWorld();
            return pc;
        }

        public void SyncToWorld()
        {
            Vec2 p = _session.WorldPosition;
            transform.position = new Vector3((float)p.X, (float)p.Y, CampusRenderer.ZPlayer);
        }

        private void Update()
        {
            Vector2 dir = ReadDirection();
            _hasInput = dir.sqrMagnitude > 0.0001f;

            if (_hasInput)
            {
                dir.Normalize();
                _facing = dir;
            }

            if (_boot != null && !_boot.Autopilot && InputEnabled)
            {
                long nowMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                float dt = Time.deltaTime;
                Vec2 worldDir = new Vec2(dir.x, dir.y);
                double desired = BaseSpeedMps;

                _session.Tick(dt, nowMs, worldDir, desired);
            }

            SyncToWorld();
            UpdateVisuals();
        }

        private void UpdateVisuals()
        {
            if (_nose != null)
            {
                Vector2 n = _facing.sqrMagnitude > 0.0001f ? _facing.normalized : new Vector2(0f, -1f);
                _nose.localPosition = new Vector3(n.x * 2.4f, n.y * 2.4f, -0.1f);
            }

            float pulse = 1f;
            if (_session != null)
            {
                float speed = (float)_session.Feed.SmoothedSpeedMps;
                pulse = 1f + Mathf.Clamp(speed / 6f, 0f, 0.25f) * Mathf.Sin(Time.time * 12f) * 0.5f;
            }
            if (_body != null)
            {
                _body.localScale = new Vector3(pulse, pulse, 1f);
            }
        }

        private Vector2 ReadDirection()
        {
            Vector2 kb = Vector2.zero;
            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)) kb.y += 1f;
            if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow)) kb.y -= 1f;
            if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) kb.x += 1f;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow)) kb.x -= 1f;
            if (kb.sqrMagnitude > 1f)
            {
                kb.Normalize();
            }

            UpdateJoystick();

            if (kb.sqrMagnitude > 0.0001f)
            {
                return kb;
            }
            return _joyValue;
        }

        private void UpdateJoystick()
        {
            float w = Screen.width;
            float h = Screen.height;
            float radius = Mathf.Min(w, h) * 0.13f;
            if (radius < 40f)
            {
                radius = 40f;
            }

            if (Input.touchCount == 0)
            {
                _fingerId = -1;
                _joyValue = Vector2.zero;
                return;
            }

            for (int i = 0; i < Input.touchCount; i++)
            {
                Touch t = Input.GetTouch(i);

                if (t.phase == TouchPhase.Began && _fingerId < 0 && t.position.x < w * 0.55f)
                {
                    _fingerId = t.fingerId;
                    _touchOrigin = t.position;
                }

                if (t.fingerId != _fingerId)
                {
                    continue;
                }

                if (t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled)
                {
                    _fingerId = -1;
                    _joyValue = Vector2.zero;
                }
                else
                {
                    Vector2 delta = (Vector2)t.position - _touchOrigin;
                    _joyValue = Vector2.ClampMagnitude(delta / radius, 1f);
                }
            }
        }

        private void OnGUI()
        {
            if (Screen.width <= 0 || Screen.height <= 0)
            {
                return;
            }

            float w = Screen.width;
            float h = Screen.height;
            float radius = Mathf.Min(w, h) * 0.13f;
            if (radius < 40f)
            {
                radius = 40f;
            }

            Vector2 home = _fingerId >= 0 ? _touchOrigin : new Vector2(w * 0.16f, h * 0.22f);
            Vector2 guiHome = new Vector2(home.x, h - home.y);

            GuiDraw.Ring(guiHome, radius, new Color(1f, 1f, 1f, 0.22f), 2f);
            GuiDraw.Ring(guiHome, radius * 0.45f, new Color(1f, 1f, 1f, 0.12f), 2f);

            Color knobColor = _joyValue.sqrMagnitude > 0.001f
                ? new Color(0.98f, 0.78f, 0.22f, 0.80f)
                : new Color(1f, 1f, 1f, 0.35f);
            Vector2 knob = guiHome + new Vector2(_joyValue.x * radius, -_joyValue.y * radius);
            GuiDraw.Disc(knob, radius * 0.30f, knobColor);
        }
    }
}
