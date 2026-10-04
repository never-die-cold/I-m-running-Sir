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
  /* 战斗子检查前置：清顿帧 + 排空升级暂停（击杀可随时触发升级） */
  function battleReady(){ BATTLE.hitStop = 0; let g = 0; while (BATTLE.state === "levelup" && g < 30) { applySkill(0); g++; } }

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

  /* ---- 战斗层（站点制：进圈出怪 / 清空打卡 / 末站 BOSS） ---- */
  session.setMode("battle"); resetRun();
  check("battle mode spawns stations (x2 dense), no GPS auto-clear", session.checkpoints.length === 6 &&
    BATTLE.state === "fighting" && BATTLE.roomsTotal === 6 &&
    !BATTLE.enemies.some(e => e.type !== "wild") && BATTLE.wave === 0);
  BATTLE.firing = true;   // 主动射击开启（元气骑士式）
  const cp0 = session.checkpoints[0];
  session.worldPos = { x: cp0.localMeters.x + 5, y: cp0.localMeters.y };
  battleTick(0.05, session.worldPos, false);
  const nw0 = BATTLE.enemies.filter(e => e.type !== "wild");
  check("entering station spawns guards", BATTLE.room === cp0 && BATTLE.wave === 1 &&
    nw0.length === 4 && nw0.every(e => e.type === "chaser"));
  check("station not cleared while guards alive", !cp0.cleared);
  battleReady();
  BATTLE.firing = true;
  BATTLE.bullets.length = 0; BATTLE.fireCd = 0;
  battleTick(0.6, session.worldPos, false);
  check("manual fire shoots and hits (standing)", BATTLE.bullets.length > 0 ||
    BATTLE.enemies.some(e => e.type !== "wild" && e.hp < e.maxHp) || BATTLE.kills > 0);
  BATTLE.bullets.length = 0; BATTLE.fireCd = 0;
  const dmgBefore = BATTLE.enemies.reduce((a, e) => a + (e.type !== "wild" ? e.hp : 0), 0);
  battleReady();
  battleTick(0.6, session.worldPos, true);
  battleReady();
  const dmgAfter = BATTLE.enemies.reduce((a, e) => a + (e.type !== "wild" ? e.hp : 0), 0);
  check("twin-stick fires while moving", BATTLE.bullets.length > 0 || dmgAfter < dmgBefore || BATTLE.kills > 0);
  const e0 = BATTLE.enemies[0];
  e0.x = session.worldPos.x + 20; e0.y = session.worldPos.y;
  const hp0 = e0.hp;
  BATTLE.bullets.length = 0; BATTLE.fireCd = 0;
  for (let i = 0; i < 14; i++) battleTick(0.1, session.worldPos, false);
  battleReady();
  check("arrow damages enemy", e0.hp < hp0 || e0.hp <= 0 ||
    BATTLE.enemies.some(e => e.hp < e.maxHp) || BATTLE.kills > 0);
  check("hit spawns damage number", BATTLE.dmgTexts.length > 0);
  BATTLE.enemies.forEach(e => { if (e.type !== "wild") { e.hp = 1; e.x = session.worldPos.x + 8; e.y = session.worldPos.y; } });
  BATTLE.bullets.length = 0; BATTLE.fireCd = 0;
  const kills0 = BATTLE.kills;
  for (let i = 0; i < 60; i++) { battleTick(0.1, session.worldPos, false); battleReady(); }
  check("clearing room checks the checkpoint", !BATTLE.enemies.some(e => e.type !== "wild") &&
    cp0.cleared === true && BATTLE.room === null && BATTLE.kills > kills0);
  check("kills drop magnet coins", BATTLE.coins > 0);
  while (BATTLE.state === "levelup") applySkill(0);
  check("levelup grants 3 choices, skill applies", (() => {
    BATTLE.hitStop = 0;                     // 顿帧不跨状态残留
    BATTLE.exp = BATTLE.expNext;
    battleTick(0.05, session.worldPos, false);
    if (BATTLE.state !== "levelup" || BATTLE.choices.length !== 3) return false;
    const snap = JSON.stringify(BATTLE.player);
    const ok = applySkill(0);
    while (BATTLE.state === "levelup") applySkill(0);
    return ok && BATTLE.state === "fighting" && JSON.stringify(BATTLE.player) !== snap;
  })());
  const cp1 = session.checkpoints[1];
  session.worldPos = { x: cp1.localMeters.x - 5, y: cp1.localMeters.y };
  battleTick(0.05, session.worldPos, false);
  battleReady();
  check("second station mixes in shooters", BATTLE.room === cp1 && BATTLE.wave === 2 &&
    BATTLE.enemies.some(e => e.type === "shooter"));
  BATTLE.enemies.forEach(e => { if (e.type !== "wild") { e.hp = 1; e.x = session.worldPos.x + 6; e.y = session.worldPos.y; } });
  BATTLE.bullets.length = 0; BATTLE.fireCd = 0;
  for (let i = 0; i < 80; i++) {
    BATTLE.invuln = 99;                                 // 测试无敌
    BATTLE.player.hp = BATTLE.player.maxHp;
    battleTick(0.1, session.worldPos, false);
    battleReady();
  }
  check("second station cleared", cp1.cleared === true && !BATTLE.enemies.some(e => e.type !== "wild"));
  while (BATTLE.state === "levelup") applySkill(0);
  check("evolution card offered and applies", (() => {
    session.setMode("battle"); resetRun();
    const cpE = session.checkpoints[0];
    session.worldPos = { x: cpE.localMeters.x, y: cpE.localMeters.y };
    battleTick(0.05, session.worldPos, false);           // 进站出怪
    battleReady();
    BATTLE.player.arrows = 2; BATTLE.player.pierce = 2;
    BATTLE.hitStop = 0;
    BATTLE.exp = BATTLE.expNext;
    battleTick(0.05, session.worldPos, false);
    if (BATTLE.state !== "levelup") return false;
    const idx = BATTLE.choices.findIndex(c => c.s && c.s.id === "evoRain");
    if (idx < 0) return false;
    applySkill(idx);
    while (BATTLE.state === "levelup") applySkill(0);
    return BATTLE.player.evo.rain === true && BATTLE.player.arrows === 3 && BATTLE.player.pierce === 3;
  })());
  BATTLE.enemies = BATTLE.enemies.filter(e => e.type === "wild");   // 清残留，专注末站断言
  BATTLE.room = null;                                                 // 过滤等效"清场"，避免误触发清站
  battleReady();
  const cpBoss = session.checkpoints[BATTLE.roomsTotal - 1];   // 末站 = BOSS 房
  session.worldPos = { x: cpBoss.localMeters.x, y: cpBoss.localMeters.y };
  battleTick(0.05, session.worldPos, false);
  battleReady();
  check("final station is a boss room", BATTLE.wave === BATTLE.roomsTotal &&
    BATTLE.enemies.some(e => e.type === "boss") &&
    BATTLE.enemies.filter(e => e.type !== "wild").length === 5);

  /* 通关：逐站清空（末站 BOSS）→ victory + 3★（野怪存活也算通关） */
  for (const cpS of session.checkpoints) {
    if (cpS.cleared) continue;
    session.worldPos = { x: cpS.localMeters.x, y: cpS.localMeters.y };
    battleTick(0.05, session.worldPos, false);
    BATTLE.enemies.forEach(e => { if (e.type !== "wild") { e.hp = 1; e.x = session.worldPos.x + 6; e.y = session.worldPos.y; } });
    BATTLE.bullets.length = 0; BATTLE.fireCd = 0;
    for (let i = 0; i < 60; i++) {
      BATTLE.invuln = 99;                                 // 测试无敌：专注验证通关流程
      battleTick(0.1, session.worldPos, false);
      battleReady();
    }
    BATTLE.hitStop = 0;
    battleTick(0.1, session.worldPos, false);
    battleTick(0.1, session.worldPos, false);
    if (BATTLE.state === "victory") break;
  }
  check("clearing final boss room wins the run", BATTLE.state === "victory" &&
    BATTLE.victory === true && !session.checkpoints.some(c => !c.cleared) &&
    !BATTLE.enemies.some(e => e.type !== "wild"));
  check("victory rates 3 stars", Progress.rateRun(session, BATTLE) === 3);
  check("victory grants bonus coins", BATTLE.coins >= 50);
  /* 复位战斗状态供后续检查 */
  session.setMode("free"); resetRun();
  session.setMode("battle"); resetRun();

  /* 局外天赋 / 不屈复活 / 金币入账 */
  check("meta talents apply at battle start", (() => {
    Progress.data.meta.atk = 1; Progress.data.meta.hp = 1;
    resetRun();
    const ok = Math.abs(BATTLE.player.atk - 10.8) < 1e-9 && BATTLE.player.maxHp === 112;
    Progress.data.meta.atk = 0; Progress.data.meta.hp = 0;
    resetRun();
    return ok && Math.abs(BATTLE.player.atk - 10) < 1e-9 && BATTLE.player.maxHp === 100;
  })());
  check("revive talent saves once", (() => {
    Progress.data.meta.revive = 1;
    resetRun();
    const cpR = session.checkpoints[0];
    session.worldPos = { x: cpR.localMeters.x, y: cpR.localMeters.y };
    battleTick(0.05, session.worldPos, false);
    BATTLE.enemies = [{ id: 9002, type: "chaser", x: BATTLE._px, y: BATTLE._py, hp: 999, maxHp: 999,
      fireT: 0, dashT: 0, dashVx: 0, dashVy: 0, dashLeft: 0, hitCd: 0, flash: 0, tele: 0, sign: 1 }];
    BATTLE.player.hp = 5;
    battleTick(0.1, session.worldPos, false);
    const ok = BATTLE.state === "fighting" && BATTLE.player.hp > 0 && BATTLE.revives === 0;
    Progress.data.meta.revive = 0;
    return ok;
  })());
  check("battle coins persist at finishRun", (() => {
    const c0 = Progress.data.coins;
    BATTLE.coins = 25;
    Progress.finishRun(session, BATTLE);
    return Progress.data.coins >= c0 + 25;
  })());
  check("metaBuy spends coins", (() => {
    Progress.data.coins = 500;
    const lv0 = Progress.data.meta.atk;
    const ok = metaBuy("atk") && Progress.data.meta.atk === lv0 + 1 && Progress.data.coins < 500;
    Progress.data.meta.atk = 0; Progress.save();
    return ok;
  })());

  /* ---- Batch B：地形减速 / 建筑碰撞 / 赶路补给 / 游荡野怪 ---- */
  check("terrain slows in water, normal on roads", (() => {
    const inLake = terrainMulAt({ x: -420, y: -170 }) === 0.6;     // 中心湖
    const onRoad = terrainMulAt({ x: -300, y: -470 }) === 1;       // 南门路口
    return inLake && onRoad;
  })());
  check("collision pushes player out of buildings", (() => {
    const lib = CAMPUS.buildings.find(b => b.n === "图书馆（西区）");
    const p = { x: lib.c.x, y: lib.c.y };
    collideCampus(p);
    return Math.abs(p.x - lib.c.x) > lib.s.x / 2 || Math.abs(p.y - lib.c.y) > lib.s.y / 2;
  })());
  session.setMode("battle"); resetRun();
  check("supplies scatter along route", BATTLE.drops.filter(d => d.kind).length >= 4);
  check("roamers spawn as wilds", BATTLE.enemies.filter(e => e.type === "wild").length >= 4);
  check("wilds do not block station clear", (() => {
    battleReady();
    const cpB = session.checkpoints[0];
    session.worldPos = { x: cpB.localMeters.x, y: cpB.localMeters.y };
    battleTick(0.05, session.worldPos, false);                     // 进站出怪
    BATTLE.enemies.forEach(e => { if (e.type !== "wild") e.hp = 1; else e.hp = 999; });
    BATTLE.bullets = []; BATTLE.fireCd = 0;
    for (let i = 0; i < 30; i++) {
      BATTLE.player.hp = BATTLE.player.maxHp;
      battleTick(0.1, session.worldPos, false);
      battleReady();
    }
    return cpB.cleared === true && BATTLE.enemies.some(e => e.type === "wild");
  })());
  check("med kit heals on pickup", (() => {
    battleReady();
    BATTLE.drops.push({ x: BATTLE._px, y: BATTLE._py, vx: 0, vy: 0, age: 0, val: 12, kind: "med" });
    BATTLE.player.hp = BATTLE.player.maxHp - 30;
    const hp0 = BATTLE.player.hp;
    battleTick(0.05, session.worldPos, false);
    return BATTLE.player.hp >= hp0 + 10;
  })());

  /* ---- Batch D：稀有度与新技能 ---- */
  check("choices carry rarity and multiplier", (() => {
    BATTLE.hitStop = 0; BATTLE.exp = BATTLE.expNext;
    battleTick(0.05, session.worldPos, false);
    while (BATTLE.state === "levelup") applySkill(0);
    BATTLE.hitStop = 0; BATTLE.exp = BATTLE.expNext;
    battleTick(0.05, session.worldPos, false);
    const ok = BATTLE.choices.every(c => c.s && c.rar && c.m >= 1) &&
      BATTLE.choices.some(c => c.rar === "common") || BATTLE.choices.some(c => c.rar === "rare") ||
      BATTLE.choices.some(c => c.rar === "epic");
    while (BATTLE.state === "levelup") applySkill(0);
    return ok;
  })());
  check("epic multiplier scales skill power", (() => {
    const s = SKILLS.find(x => x.id === "atk");
    BATTLE.player.atk = 10; s.ap(BATTLE.player, 2);
    const epic = BATTLE.player.atk === 16;
    BATTLE.player.atk = 10; s.ap(BATTLE.player, 1);
    const normal = BATTLE.player.atk === 13;
    BATTLE.player.atk = 10;
    return epic && normal;
  })());
  check("burn applies damage over time", (() => {
    battleReady();
    BATTLE.enemies = [{ id: 9006, type: "chaser", x: BATTLE._px + 40, y: BATTLE._py, hp: 50, maxHp: 50,
      fireT: 0, dashT: 0, dashVx: 0, dashVy: 0, dashLeft: 0, hitCd: 0, flash: 0, tele: 0, elite: false, sign: 1 }];
    BATTLE.player.burn = true; BATTLE.player.burnDps = 3;
    BATTLE.enemies[0].burnT = 3; BATTLE.enemies[0].burnDps = 3;
    BATTLE.bullets = []; BATTLE.fireCd = 99;   // 关闭射击，纯测燃烧
    const h0 = BATTLE.enemies[0].hp;
    for (let i = 0; i < 20; i++) battleTick(0.1, session.worldPos, true);  // 移动中也不影响燃烧
    const dmg = h0 - (BATTLE.enemies[0] ? BATTLE.enemies[0].hp : 0);
    BATTLE.player.burn = false;
    return dmg >= 5;
  })());
  check("shield blocks one hit", (() => {
    battleReady();
    BATTLE.enemies = [{ id: 9007, type: "chaser", x: BATTLE._px, y: BATTLE._py, hp: 999, maxHp: 999,
      fireT: 0, dashT: 0, dashVx: 0, dashVy: 0, dashLeft: 0, hitCd: 0, flash: 0, tele: 0, elite: false, sign: 1 }];
    BATTLE.player.shieldLv = 1; BATTLE.player.shield = 1; BATTLE.player.shieldCd = 0;
    BATTLE.player.hp = 100;
    battleTick(0.1, session.worldPos, false);
    const blocked = BATTLE.player.hp === 100 && BATTLE.player.shield === 0;
    BATTLE.hitStop = 0; BATTLE.enemies[0].hitCd = 0;
    battleTick(0.1, session.worldPos, false);
    const hurt = BATTLE.player.hp < 100;
    BATTLE.player.shieldLv = 0;
    return blocked && hurt;
  })());

  /* ---- Batch C：设置项（音量/震屏/伤害数字） ---- */
  check("settings load with defaults", SETT.data.volume === 0.18 && SETT.data.shake === true && SETT.data.dmgNum === true);
  check("settings volume persists", (() => {
    SETT.data.volume = 0.5; SETT.save();
    const v = Store.read("settings", {}).volume;
    SETT.data.volume = 0.18; SETT.save();
    return v === 0.5;
  })());
  check("dmg-number toggle gates floating text", (() => {
    SETT.data.dmgNum = false;
    const eS = BATTLE.enemies[0];
    const before = BATTLE.dmgTexts.length;
    const hpS = eS ? eS.hp : 999;
    if (eS) { eS.x = session.worldPos.x + 12; eS.y = session.worldPos.y; eS.hitsFix = true; }
    BATTLE.bullets = []; BATTLE.fireCd = 0;
    for (let i = 0; i < 8; i++) battleTick(0.1, session.worldPos, false);
    const gated = BATTLE.dmgTexts.length === 0 || BATTLE.dmgTexts.length === before;
    SETT.data.dmgNum = true;
    return gated;
  })());

  /* 翻滚无敌帧 / 精英掉落 / BOSS 双弹幕 */
  check("battle dash grants i-frames", (() => {
    session.setMode("battle"); resetRun();
    const cpD = session.checkpoints[0];
    session.worldPos = { x: cpD.localMeters.x, y: cpD.localMeters.y };
    battleDash(1, 0);
    battleTick(0.05, session.worldPos, false);          // dash 0.17 / invuln 0.25
    BATTLE.enemies = [{ id: 9003, type: "chaser", x: BATTLE._px, y: BATTLE._py, hp: 999, maxHp: 999,
      fireT: 0, dashT: 0, dashVx: 0, dashVy: 0, dashLeft: 0, hitCd: 0, flash: 0, tele: 0, elite: false, sign: 1 }];
    const hp0 = BATTLE.player.hp;
    battleTick(0.10, session.worldPos, false);          // 无敌帧内接触不掉血
    const noDmg = BATTLE.player.hp === hp0;
    BATTLE.invuln = 0;
    BATTLE.enemies[0].hitCd = 0;                        // 无敌帧内接触也会消耗怪的攻击冷却
    BATTLE.hitStop = 0;
    battleTick(0.10, session.worldPos, false);          // 无敌结束 → 受伤
    return noDmg && BATTLE.player.hp < hp0 && BATTLE.dashCd > 0;
  })());
  check("elite kill drops 5 coins", (() => {
    BATTLE.enemies = [];
    BATTLE.bullets = []; BATTLE.ebullets = []; BATTLE.drops = [];
    const c0 = BATTLE.coins;
    BATTLE.enemies.push({ id: 9004, type: "chaser", elite: true, x: BATTLE._px + 30, y: BATTLE._py,
      hp: 1, maxHp: 40, fireT: 0, dashT: 0, dashVx: 0, dashVy: 0, dashLeft: 0, hitCd: 0, flash: 0, tele: 0, sign: 1 });
    BATTLE.fireCd = 0;
    for (let i = 0; i < 18; i++) battleTick(0.1, session.worldPos, false);
    return BATTLE.enemies.length === 0 && BATTLE.coins >= c0 + 5;
  })());
  check("boss alternates ring and aimed spread", (() => {
    while (BATTLE.state === "levelup") applySkill(0);   // 精英击杀可能触发升级暂停
    BATTLE.hitStop = 0;
    BATTLE.enemies = [{ id: 9005, type: "boss", x: BATTLE._px - 60, y: BATTLE._py, hp: 999, maxHp: 999,
      fireT: 0.05, dashT: 0, dashVx: 0, dashVy: 0, dashLeft: 0, hitCd: 0, flash: 0, tele: 0, elite: false, sign: 1, phase: 0 }];
    BATTLE.ebullets = []; BATTLE.bullets = []; BATTLE.drops = [];
    BATTLE.player.hp = BATTLE.player.maxHp;
    battleTick(0.1, session.worldPos, false);           // phase1：环形 10
    const ring = BATTLE.ebullets.length;
    BATTLE.ebullets = [];
    for (let i = 0; i < 26; i++) { BATTLE.player.hp = BATTLE.player.maxHp; battleTick(0.1, session.worldPos, false); }
    const spread = BATTLE.ebullets.length;              // phase2：扇形 5（含顿帧耗时冗余）
    BATTLE.enemies = []; BATTLE.ebullets = [];
    BATTLE.hitStop = 0;
    return ring === 10 && spread === 5;
  })());

  while (BATTLE.state === "levelup") applySkill(0);
  BATTLE.hitStop = 0;
  BATTLE.enemies = []; BATTLE.ebullets = []; BATTLE.bullets = [];
  BATTLE.hitStop = 0;                                   // 清残留顿帧
  BATTLE.enemies.push({ id: 9001, type: "chaser", x: BATTLE._px, y: BATTLE._py, hp: 999, maxHp: 999,
    fireT: 0, dashT: 0, dashVx: 0, dashVy: 0, dashLeft: 0, hitCd: 0, flash: 0, tele: 0, elite: false, sign: 1 });
  const hpB = BATTLE.player.hp;
  battleTick(0.1, session.worldPos, false);
  check("enemy contact damages player", BATTLE.player.hp < hpB);
  BATTLE.player.hp = 5;
  BATTLE.hitStop = 0;
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

  /* ---- 昼夜 / 天气 / 音效 / 粒子 ---- */
  ENV.reset(77);
  const min0 = ENV.minutes;
  ENV.tick(1.0, 1);
  check("env clock advances (1s -> 1min at 1x)", Math.abs(ENV.minutes - min0 - 1) < 1e-6);
  ENV.minutes = 12 * 60;
  check("12:00 is daytime", ENV.isNight() === false);
  ENV.minutes = 21 * 60;
  check("21:00 is night", ENV.isNight() === true);
  check("clock text format", /^\\d{2}:\\d{2}$/.test(ENV.clockText()));
  ENV.reset(77);
  ENV.rollWeather();
  check("weather rolls to valid state", ["sunny", "cloudy", "rain"].includes(ENV.weather));
  check("sfx safe headless & mute persisted", (() => {
    Sfx.play("checkpoint"); Sfx.play("ach");
    const m0 = Sfx.muted;
    const m1 = Sfx.toggle();
    const saved = Store.read("muted", null);
    Sfx.toggle();
    return typeof m0 === "boolean" && m1 !== m0 && saved === m1;
  })());
  check("particles capped and expire", (() => {
    for (let i = 0; i < 300; i++) spawnDust(0, 0);
    const dustOk = PFX.length <= 240;
    for (let i = 0; i < 300; i++) spawnConfetti(0, 0);
    const confOk = PFX.length <= 280;
    updatePfx(2);
    return dustOk && confOk && PFX.length === 0;
  })());
  check("night/rain run achievements", (() => {
    Progress.finishRun({ recordedDist: 0, duration: 0, campus: CAMPUS, mode: "free" }, null);
    const mk = (dur) => ({ recordedDist: 10, duration: dur, checkpoints: [], campus: CAMPUS,
      mode: "free", landmarksFound: [], sprinting: false });
    const envN = { isNight: () => true, isRain: () => false };
    Progress.observe(mk(0), { kills: 0, wave: 0, level: 1 }, envN);
    Progress.observe(mk(70), { kills: 0, wave: 0, level: 1 }, envN);
    return Progress.has("night_owl") && !Progress.has("rain_runner");
  })());

  /* ---- 结算星级（3★=均配速≤5'30"，2★≤6'30"，战斗按波次） ---- */
  check("rating 3-star fast pace", (() => {
    const s = { recordedDist: 2000, duration: 640, campus: CAMPUS, mode: "free" };
    return Progress.rateRun(s, null) === 3;
  })());
  check("rating 2-star mid pace", (() => {
    const s = { recordedDist: 2000, duration: 760, campus: CAMPUS, mode: "free" };
    return Progress.rateRun(s, null) === 2;
  })());
  check("rating 1-star slow pace", (() => {
    const s = { recordedDist: 2000, duration: 1000, campus: CAMPUS, mode: "free" };
    return Progress.rateRun(s, null) === 1;
  })());
  check("rating 0-star run too short", (() => {
    const s = { recordedDist: 500, duration: 120, campus: CAMPUS, mode: "free" };
    return Progress.rateRun(s, null) === 0;
  })());
  check("rating battle by wave", (() => {
    const cases = [[{ wave: 5, kills: 1 }, 3], [{ wave: 3, kills: 1 }, 2],
                   [{ wave: 1, kills: 1 }, 1], [{ wave: 0, kills: 0 }, 0]];
    return cases.every(([b, exp]) => Progress.rateRun({ recordedDist: 0, duration: 0, campus: CAMPUS, mode: "battle" }, b) === exp);
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
