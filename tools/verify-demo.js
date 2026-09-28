"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const htmlPath = path.join(__dirname, "..", "demo", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");

/* 按文档顺序收集 <script src> 外链与内联 <script>，拼接后执行 */
const parts = [];
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) {
  const attrs = m[1] || "";
  const src = /src="([^"]+)"/.exec(attrs);
  if (src) {
    parts.push(fs.readFileSync(path.join(path.dirname(htmlPath), src[1]), "utf8"));
  } else if (m[2] && m[2].trim()) {
    parts.push(m[2]);
  }
}
if (parts.length === 0) {
  console.error("FAIL: no script content found in demo/index.html");
  process.exit(1);
}
const source = parts.join("\n;\n");

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
  process: { exitCode: 0 },
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

  const capDist = session.route.length * 1.02;

  let guard = 0;
  while (session.recordedDist < capDist && guard < 90000) {
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

  /* ---- c4 玩法：模式 / 冲刺体力 / 导航 / 巡礼 / 自由跑 ---- */
  check("mode switch rejects bad value", (() => {
    try { session.setMode("nope"); return false; } catch (e) { return true; }
  })());

  /* 巡礼：地标半径触发（数据里 r 为 30~70m） */
  session.setMode("tour"); resetRun();
  check("tour mode has no checkpoints", session.checkpoints.length === 0);
  check("tour: landmark found within its radius", (() => {
    const lm = CAMPUS.landmarks[0];
    session.worldPos = { x: lm.c.x + lm.r * 0.5, y: lm.c.y };
    const n = session.checkLandmarks();
    return n === 1 && session.landmarksFound.length === 1 && session.landmarksFound[0] === lm.n;
  })());
  check("tour: landmark NOT found outside radius", (() => {
    const lm = CAMPUS.landmarks[1];
    session.worldPos = { x: lm.c.x + lm.r + 30, y: lm.c.y };
    return session.checkLandmarks() === 0;
  })());

  /* 自由跑：无打卡点，可正常跑 */
  session.setMode("free"); resetRun();
  check("free mode has no checkpoints", session.checkpoints.length === 0);
  for (let i = 0; i < 10; i++) session.tick(1.0, Date.now(), { x: 1, y: 0 }, 2.94, false);
  check("free mode runs without error", isFinite(session.recordedDist) && session.fixCount >= 5);

  /* 导航目标 = 最近未打卡点 */
  session.setMode("checkpoint"); resetRun();
  session.tickAutopilot(1.0, Date.now(), 2.94);
  const nt = session.navTarget;
  check("nav target set after first fix", !!nt && !nt.cleared);
  check("nav target is nearest uncleared checkpoint", (() => {
    let bd = Infinity;
    for (const c of session.checkpoints) {
      const d = V.dist(session.worldPos, c.localMeters);
      if (d < bd) bd = d;
    }
    return Math.abs(V.dist(session.worldPos, nt.localMeters) - bd) < 1e-6;
  })());
  check("nav target null after all cleared", (() => {
    session.checkpoints.forEach(c => c.cleared = true);
    session.tickAutopilot(1.0, Date.now(), 2.94);
    return session.navTarget === null;
  })());

  /* 冲刺：体力 100 耗尽 ≤ 9s（12/s），期间配速不越界且快于常速 */
  resetRun();
  const sprintFixes = [];
  let tSprint = 0, exhausted = false, sprintFlagSeen = false, seenFixes = session.fixCount;
  while (tSprint < 30) {
    session.tick(0.25, Date.now(), { x: 1, y: 0 }, 2.94, true);
    tSprint += 0.25;
    if (session.sprinting) sprintFlagSeen = true;
    if (session.fixCount > seenFixes) { sprintFixes.push(session.lastFix); seenFixes = session.fixCount; }
    if (session.stamina <= 0) { exhausted = true; break; }
  }
  check("sprint flag engages while sprinting", sprintFlagSeen);
  check("sprint multiplier is 1.55", (() => {
    session.sprinting = true; session.stamina = 50;
    const m = session.sprintMul();
    session.sprinting = false;
    return m === 1.55;
  })());
  check("stamina drains to 0 within 9s of sprint", exhausted && tSprint <= 9.0);
  check("sprint pace stays in legal band", sprintFixes.every(f =>
    f.speed <= 0.3 || (1000 / f.speed >= 179 && 1000 / f.speed <= 541)));
  check("sprint moves faster than normal pace", (() => {
    const sp = sprintFixes.filter(f => f.speed > 0.3).map(f => f.speed);
    if (sp.length < 3) return false;
    const tail = sp.slice(-5);
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    return mean > 3.3;
  })());

  /* 非冲刺恢复：7/s，6s 应回到 ≥35 */
  for (let i = 0; i < 24; i++) session.tick(0.25, Date.now(), { x: 1, y: 0 }, 2.94, false);
  check("stamina regenerates when not sprinting (6s -> >=35)", session.stamina >= 35);

  /* ---- 战斗层（弓箭手大作战式）：波次/索敌/伤害/升级/死亡 ---- */
  session.setMode("battle"); resetRun();
  check("battle mode accepted, no checkpoints", session.checkpoints.length === 0 &&
    BATTLE.state === "fighting" && BATTLE.wave === 0 && BATTLE.enemies.length === 0);
  battleTick(2.0, session.worldPos, false);
  check("wave 1 spawns chasers on schedule", BATTLE.wave === 1 &&
    BATTLE.enemies.length === 3 && BATTLE.enemies.every(e => e.type === "chaser"));
  battleTick(0.6, session.worldPos, false);
  check("stand still auto-fires arrows", BATTLE.bullets.length > 0);
  BATTLE.bullets.length = 0; BATTLE.fireCd = 0;
  battleTick(0.1, session.worldPos, true);
  check("no arrows while moving", BATTLE.bullets.length === 0);
  const e0 = BATTLE.enemies[0];
  e0.x = session.worldPos.x + 20; e0.y = session.worldPos.y;
  const hp0 = e0.hp;
  BATTLE.bullets.length = 0; BATTLE.fireCd = 0;
  for (let i = 0; i < 12; i++) battleTick(0.1, session.worldPos, false);
  check("arrow damages enemy", e0.hp < hp0 || e0.hp <= 0);
  BATTLE.enemies.forEach(e => { e.hp = 1; });
  BATTLE.bullets.length = 0; BATTLE.fireCd = 0;
  const kills0 = BATTLE.kills;
  for (let i = 0; i < 10; i++) battleTick(0.1, session.worldPos, false);
  check("kill grants exp/kills", BATTLE.kills > kills0 && BATTLE.exp + (BATTLE.level - 1) * 10 > 0);
  BATTLE.exp = BATTLE.expNext;
  battleTick(0.05, session.worldPos, false);
  check("levelup pauses with 3 choices", BATTLE.state === "levelup" && BATTLE.choices.length === 3);
  const snap = JSON.stringify(BATTLE.player);
  check("applySkill applies an effect and resumes", (() => {
    const ok = applySkill(0);
    return ok && BATTLE.state === "fighting" && JSON.stringify(BATTLE.player) !== snap;
  })());
  BATTLE.enemies = []; BATTLE.ebullets = []; BATTLE.bullets = [];
  BATTLE.enemies.push({ id: 9001, type: "chaser", x: BATTLE._px, y: BATTLE._py, hp: 999, maxHp: 999,
    fireT: 0, dashT: 0, dashVx: 0, dashVy: 0, dashLeft: 0, hitCd: 0, sign: 1 });
  battleTick(0.1, session.worldPos, false);
  check("enemy contact damages player", BATTLE.player.hp < 100);
  BATTLE.player.hp = 5;
  battleTick(1.0, session.worldPos, false);
  check("player dies at 0 hp", BATTLE.state === "dead" && BATTLE.player.hp === 0);

  /* ---- 存储 / 成就 / 记录（headless 无 localStorage，自动降级内存） ---- */
  check("store falls back gracefully (no crash)", typeof Store.persistent() === "boolean");
  check("achievement defs unique (>=10)", (() => {
    const ids = ACH_DEFS.map(a => a.id);
    return ids.length >= 10 && new Set(ids).size === ids.length;
  })());
  check("progress unlock once-only", (() => {
    const a0 = Progress.data.ach.length;
    const first = Progress.unlock("first_cp");
    const second = Progress.unlock("first_cp");
    return first === true && second === false && Progress.data.ach.length === a0 + 1 && Progress.has("first_cp");
  })());
  check("progress accumulates distance/kills", (() => {
    Progress.finishRun({ recordedDist: 0, duration: 0, campus: CAMPUS, mode: "free" }, null);
    const d0 = Progress.data.totalDistM, k0 = Progress.data.totalKills;
    const mk = (dist, dur, kills) => ({ recordedDist: dist, duration: dur, checkpoints: [],
      campus: CAMPUS, mode: "free", landmarksFound: [], sprinting: false });
    Progress.observe(mk(500, 10, 0), { kills: 0, wave: 1, level: 1 });   // 建立基线
    Progress.observe(mk(900, 20, 0), { kills: 3, wave: 1, level: 1 });   // +400m / +3 杀
    return Progress.data.totalDistM > d0 && Progress.data.totalKills >= k0 + 3 &&
      Progress.has("first_kill");
  })());
  check("pace500 unlocks on fast run", (() => {
    Progress.finishRun({ recordedDist: 2000, duration: 580, campus: CAMPUS, mode: "checkpoint" }, null);
    return Progress.has("pace500");
  })());
  check("best record per campus×mode", (() => {
    Progress.finishRun({ recordedDist: 3500, duration: 1200, campus: CAMPUS, mode: "free" },
      { kills: 7, wave: 2, level: 3 });
    const b = Progress.data.best[CAMPUS.id + ":free"];
    return !!b && b.distM === 3500 && b.kills === 7 && b.wave === 2;
  })());

  /* 恢复默认状态 */
  session.setMode("checkpoint"); resetRun();

  /* ---- 校园数据完整性 ---- */
  check("campus: main loop length sane (2.5km~4.5km)", CAMPUS.mainRoute.length > 2500 && CAMPUS.mainRoute.length < 4500);
  check("campus: >=20 landmarks, unique names", (() => {
    const ns = CAMPUS.landmarks.map(l => l.n);
    return ns.length >= 20 && new Set(ns).size === ns.length;
  })());
  check("campus: buildings inside bounds", CAMPUS.buildings.every(b =>
    b.c.x - b.s.x/2 > CAMPUS.bounds.minX && b.c.x + b.s.x/2 < CAMPUS.bounds.maxX &&
    b.c.y - b.s.y/2 > CAMPUS.bounds.minY && b.c.y + b.s.y/2 < CAMPUS.bounds.maxY));
  check("campus: buildings clear of roads", CAMPUS.buildings.every(b =>
    !_nearAnyRoad(b.c.x, b.c.y, CAMPUS.roads, 2)));
  check("campus: main route clear of buildings", (() => {
    for (let d = 0; d < CAMPUS.mainRoute.length; d += 10) {
      const p = CAMPUS.mainRoute.pointAt(d);
      for (const b of CAMPUS.buildings) {
        if (Math.abs(p.x - b.c.x) < b.s.x/2 + 2 && Math.abs(p.y - b.c.y) < b.s.y/2 + 2) return false;
      }
    }
    return true;
  })());
  check("campus: trees generated, clear of roads", CAMPUS.trees.length > 40 &&
    CAMPUS.trees.every(t => !_nearAnyRoad(t.x, t.y, CAMPUS.roads, 2)));
  if (CAMPUS.id === "suzhou") {
    check("campus(suzhou): origin near Taihu Science City", Math.abs(CAMPUS.origin.lat - 31.36) < 0.05 && Math.abs(CAMPUS.origin.lon - 120.38) < 0.05);
    check("campus(suzhou): signature landmarks present", ["南雍楼","科创大厦","庄里山","北大楼（风貌群）"].every(n =>
      CAMPUS.landmarks.some(l => l.n === n)));
  }

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
