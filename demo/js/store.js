"use strict";
/* ============================================================
   store.js —— 成就 / 记录（localStorage 容错，headless 自动降级内存）
   ============================================================ */

const Store = (() => {
  const mem = {};
  let ok = false;
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      localStorage.setItem("__lpr_t", "1"); localStorage.removeItem("__lpr_t");
      ok = true;
    }
  } catch (e) { ok = false; }
  return {
    persistent: () => ok,
    read(k, dflt) {
      if (ok) { try { const v = localStorage.getItem("lpr:" + k); if (v != null) return JSON.parse(v); } catch (e) {} }
      return (k in mem) ? mem[k] : dflt;
    },
    write(k, v) {
      mem[k] = v;
      if (ok) { try { localStorage.setItem("lpr:" + k, JSON.stringify(v)); } catch (e) {} }
    }
  };
})();

/* 成就定义（夜跑/雨跑等表现类在 c6 加入） */
const ACH_DEFS = [
  { id:"first_run",     n:"首次奔跑",   d:"完成第一段跑步（≥100m）" },
  { id:"first_cp",      n:"旗开得胜",   d:"第一次打卡成功" },
  { id:"all_cp",        n:"定向全清",   d:"单局清空全部打卡点" },
  { id:"all_landmarks", n:"巡礼者",     d:"巡礼模式集齐全部地标" },
  { id:"km5",           n:"五公里俱乐部", d:"累计里程 5 km" },
  { id:"km21",          n:"半马勇士",   d:"累计里程 21.0975 km" },
  { id:"pace500",       n:"配速达人",   d:"单局 ≥1km 且均配速快于 5'00\"" },
  { id:"sprint30",      n:"疾风行者",   d:"单局冲刺累计 30 秒" },
  { id:"first_kill",    n:"首猎",       d:"战斗模式完成首次击杀" },
  { id:"kill50",        n:"战神",       d:"累计击杀 50 名敌人" },
  { id:"wave5",         n:"破晓",       d:"战斗中撑到第 5 波（迎战首个 BOSS）" },
  { id:"lvl5",          n:"觉醒",       d:"单局内升至 Lv.5" },
  { id:"night_owl",     n:"夜猫子",     d:"夜间累计奔跑 60 秒" },
  { id:"rain_runner",   n:"雨中曲",     d:"雨中累计奔跑 60 秒" }
];

const Progress = {
  data: null,
  onToast: null,          // ui.js 注入 (text, kind)
  _lastDur: -1, _lastDist: -1, _lastKills: -1, _sprint: 0, _lastSaveMs: 0, _night: 0, _rain: 0,

  load() {
    this.data = Store.read("progress", { ach: [], totalDistM: 0, totalKills: 0, best: {} });
    if (!this.data.ach) this.data.ach = [];
    if (!this.data.best) this.data.best = {};
    return this.data;
  },
  save() { Store.write("progress", this.data); },
  has(id) { return this.data.ach.includes(id); },
  unlock(id) {
    if (this.has(id)) return false;
    const def = ACH_DEFS.find(a => a.id === id);
    if (!def) return false;
    this.data.ach.push(id);
    this.save();
    if (this.onToast) this.onToast("🏆 成就解锁 · " + def.n, "ach");
    return true;
  },

  /* 每帧观察：里程/击杀增量 + 单局内状态成就；env 提供昼夜/天气（可省略） */
  observe(session, battle, env) {
    env = env || { isNight: () => false, isRain: () => false };
    const d = session.recordedDist, k = battle ? battle.kills : 0, dur = session.duration;
    if (this._lastDur < 0) { this._lastDur = dur; this._lastDist = d; this._lastKills = k; }
    const ddur = Math.max(0, dur - this._lastDur);
    if (d > this._lastDist) this.data.totalDistM += (d - this._lastDist);
    this._lastDist = d;
    if (k > this._lastKills) {
      this.data.totalKills += (k - this._lastKills);
      if (this._lastKills === 0 && k > 0) this.unlock("first_kill");
    }
    this._lastKills = k;
    if (session.sprinting) this._sprint += ddur;
    if (env.isNight()) this._night += ddur;
    if (env.isRain()) this._rain += ddur;
    this._lastDur = dur;

    if (this.data.totalDistM >= 5000) this.unlock("km5");
    if (this.data.totalDistM >= 21097.5) this.unlock("km21");
    if (this.data.totalKills >= 50) this.unlock("kill50");
    if (this._sprint >= 30) this.unlock("sprint30");
    if (this._night >= 60) this.unlock("night_owl");
    if (this._rain >= 60) this.unlock("rain_runner");

    const cleared = session.checkpoints.filter(c => c.cleared).length;
    if (cleared > 0) this.unlock("first_cp");
    if (session.checkpoints.length >= 3 && cleared === session.checkpoints.length) this.unlock("all_cp");
    const lm = (session.campus.landmarks || []).length;
    if (session.mode === "tour" && lm > 0 && session.landmarksFound.length >= lm) this.unlock("all_landmarks");
    if (battle) {
      if (battle.wave >= 5) this.unlock("wave5");
      if (battle.level >= 5) this.unlock("lvl5");
    }
    if (dur > 3 && Date.now() - this._lastSaveMs > 2000) {   // 落盘节流 2s
      this._lastSaveMs = Date.now();
      this.save();
    }
  },

  /* resetRun 前结算上一局：成就 / 每校园×模式最佳记录 */
  finishRun(session, battle) {
    const dist = session.recordedDist, dur = session.duration;
    const key = session.campus.id + ":" + session.mode;
    if (dist >= 100) this.unlock("first_run");
    if (dist >= 1000 && dur >= 60) {
      const pace = 1000 * dur / dist;
      if (pace < 300) this.unlock("pace500");
    }
    if (dist > 100 || (battle && battle.kills > 0)) {
      const b = this.data.best[key] || { distM: 0, kills: 0, wave: 0, bestPace: 0 };
      const before = JSON.stringify(b);
      if (dist > (b.distM || 0)) b.distM = Math.round(dist);
      if (battle) {
        if (battle.kills > (b.kills || 0)) b.kills = battle.kills;
        if (battle.wave > (b.wave || 0)) b.wave = battle.wave;
      }
      if (dist >= 1000 && dur >= 60) {
        const pace = 1000 * dur / dist;
        if (!b.bestPace || pace < b.bestPace) b.bestPace = +pace.toFixed(1);
      }
      if (JSON.stringify(b) !== before) {
        this.data.best[key] = b;
        if (this.onToast) this.onToast("📜 新纪录 · " + session.campus.name, "rec");
      }
    }
    this._lastDur = -1; this._lastDist = -1; this._lastKills = -1; this._sprint = 0;
    this.save();
  }
};

Progress.load();
