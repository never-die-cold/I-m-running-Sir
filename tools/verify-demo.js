"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const htmlPath = path.join(__dirname, "..", "demo", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");

const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (blocks.length === 0) {
  console.error("FAIL: no <script> block found in demo/index.html");
  process.exit(1);
}
const source = blocks[blocks.length - 1][1];

const noop = () => {};
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === "createRadialGradient" || k === "createLinearGradient") {
      return () => ({ addColorStop: noop });
    }
    if (k in t) return t[k];
    return noop;
  },
  set(t, k, v) { t[k] = v; return true; }
});

function makeEl() {
  return {
    textContent: "", className: "", style: {}, dataset: {}, width: 0, height: 0,
    clientWidth: 1280, clientHeight: 720,
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, remove: noop,
    setPointerCapture: noop, releasePointerCapture: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    getContext: () => ctxStub
  };
}

const sandbox = {
  console,
  Math, Date, JSON, Object, Array, String, Number, Boolean, Error, isFinite, isNaN,
  parseFloat, parseInt, performance: { now: () => Date.now() },
  requestAnimationFrame: noop,
  document: {
    getElementById: makeEl,
    querySelectorAll: () => [],
    addEventListener: noop
  },
  window: { addEventListener: noop, devicePixelRatio: 1 }
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

const test = `
;(function(){
  const results = [];
  function check(label, ok){ results.push([label, !!ok]); }

  const targetSpeed = 2.94;
  const fixes = [];
  const steps = [];
  let prev = null;
  let maxStep = 0, minStep = Infinity, sumStep = 0;

  resetRun();
  const active = session.checkpoints.filter(c => !c.cleared).length;
  check("checkpoint spawn excludes start region", session.checkpoints.length === 3 && session.checkpoints[0].routeDistance > 30);

  let guard = 0;
  while (session.recordedDist < 2500 && guard < 60000) {
    guard++;
    const f = session.tickAutopilot(1.0, Date.now(), targetSpeed);
    fixes.push(f);
    if (prev) {
      const d = haversine(prev, { lat: f.lat, lon: f.lon });
      steps.push(d); sumStep += d;
      if (d > maxStep) maxStep = d;
      if (d < minStep) minStep = d;
    }
    prev = { lat: f.lat, lon: f.lon };
  }

  const duration = session.duration;
  const recorded = session.recordedDist;
  const truth = session.trueDist;
  const avgSpeed = recorded / duration;
  const avgPace = 1000 / avgSpeed;
  const meanStep = sumStep / Math.max(1, steps.length);
  let varr = 0;
  for (const s of steps) varr += (s - meanStep) * (s - meanStep);
  const stdStep = steps.length > 1 ? Math.sqrt(varr / (steps.length - 1)) : 0;

  let outOfBand = 0;
  let minP = Infinity, maxP = 0;
  for (const f of fixes) {
    if (f.speed > 0.3) {
      const p = 1000 / f.speed;
      if (p < minP) minP = p;
      if (p > maxP) maxP = p;
      if (p < 179 || p > 541) outOfBand++;
    }
  }

  const nm = fixes[fixes.length - 1];

  console.log("");
  console.log("===================== JS demo headless verification =====================");
  console.log(" fixes            : " + fixes.length);
  console.log(" duration         : " + duration.toFixed(1) + " s");
  console.log(" recorded dist    : " + (recorded/1000).toFixed(3) + " km");
  console.log(" true dist        : " + (truth/1000).toFixed(3) + " km");
  console.log(" jitter bias      : " + ((recorded-truth)/truth*100).toFixed(2) + " %");
  console.log(" avg pace         : " + fmtPace(avgPace));
  console.log(" fastest / slowest: " + fmtPace(minP) + " / " + fmtPace(maxP));
  console.log(" out of band      : " + outOfBand + " / " + fixes.length);
  console.log(" step mean / std  : " + meanStep.toFixed(3) + " / " + stdStep.toFixed(3) + " m  (CV " + (stdStep/meanStep*100).toFixed(1) + "%)");
  console.log(" max step         : " + maxStep.toFixed(3) + " m");
  console.log(" last fix         : " + nm.lat.toFixed(7) + "," + nm.lon.toFixed(7) + " acc=" + nm.accuracy.toFixed(1) + " spd=" + nm.speed.toFixed(2));
  console.log("");

  check("avg pace within legal band (3'00\\"~9'00\\")", avgPace >= 180 && avgPace <= 540);
  check("no instantaneous pace out of band", outOfBand === 0);
  check("no teleport (max step < 8m)", maxStep < 8.0);
  check("step length has realistic noise (CV 5%~40%)", stdStep/meanStep > 0.05 && stdStep/meanStep < 0.40);
  check("distance bias under 10%", Math.abs(recorded-truth)/truth < 0.10);
  check("all checkpoints reachable", session.checkpoints.every(c => c.cleared));
  check("coordinate is a valid LatLon", nm.lat > -90 && nm.lat < 90 && nm.lon > -180 && nm.lon < 180);
  check("elapsedRealtimeNanos monotonic", fixes.every((f,i) => i===0 || f.elapsedRealtimeNanos > fixes[i-1].elapsedRealtimeNanos));
  check("accuracy in realistic range (3~20m)", fixes.every(f => f.accuracy > 3 && f.accuracy < 20));

  console.log(" [checks]");
  let failed = 0;
  for (const [label, ok] of results) {
    if (!ok) failed++;
    console.log("   [" + (ok ? "PASS" : "FAIL") + "] " + label);
  }
  console.log("=========================================================================");
  if (failed > 0) { console.log(" " + failed + " check(s) FAILED"); process.exitCode = 1; }
  else console.log(" all checks passed");
})();
`;

try {
  vm.createContext(sandbox);
  vm.runInContext(source + test, sandbox, { filename: "demo-script.js" });
} catch (e) {
  console.error("FAIL: script error ->", e && e.stack ? e.stack : e);
  process.exit(1);
}
