using System;
using UnityEngine;
using CampusRun.Core;

namespace CampusRun.Unity
{
    public class MockLocationBridge : MonoBehaviour
    {
        private const string DriverClass = "com.campusrun.mock.MockLocationDriver";
        private const string UnityPlayerClass = "com.unity3d.player.UnityPlayer";

        private AndroidJavaObject _driver;
        private AndroidJavaClass _driverClass;
        private bool _available;
        private bool _errorLogged;
        private string _lastPayload;

        public bool Available
        {
            get { return _available; }
        }

        public string Status = "Editor mode (Android bridge idle)";

        private void Awake()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                AndroidJavaClass playerClass = new AndroidJavaClass(UnityPlayerClass);
                AndroidJavaObject activity = playerClass.GetStatic<AndroidJavaObject>("currentActivity");

                _driverClass = new AndroidJavaClass(DriverClass);
                _driverClass.CallStatic("init", activity);

                _driver = _driverClass.CallStatic<AndroidJavaObject>("getInstance");
                _available = _driver != null;

                if (_available)
                {
                    string message = _driver.Call<string>("startService");
                    Status = "mock service: " + message;
                }
                else
                {
                    Status = "mock service unavailable";
                }
            }
            catch (Exception e)
            {
                _available = false;
                Status = "bridge failed: " + e.GetType().Name;
                Debug.LogWarning("[MockLocationBridge] " + e);
            }
#else
            Status = "editor build (no Android injection)";
#endif
        }

        public void Push(RunSession session)
        {
            if (!_available || _driver == null || session == null)
            {
                return;
            }

            string payload = session.LastEnvelopeJson;
            if (payload == null || payload == _lastPayload)
            {
                return;
            }
            _lastPayload = payload;

            try
            {
                _driver.Call<bool>("pushFix", payload);
            }
            catch (Exception e)
            {
                if (!_errorLogged)
                {
                    _errorLogged = true;
                    Debug.LogWarning("[MockLocationBridge] pushFix failed: " + e);
                }
                _available = false;
                Status = "bridge error (disabled)";
            }
        }

        public void StopService()
        {
            if (!_available || _driver == null)
            {
                return;
            }
            try
            {
                _driver.Call("stopService");
            }
            catch (Exception e)
            {
                Debug.LogWarning("[MockLocationBridge] stopService failed: " + e);
            }
        }

        private void OnApplicationQuit()
        {
            StopService();
        }
    }
}
