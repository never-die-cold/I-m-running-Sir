"use strict";
/* ============================================================
   env.js —— 昼夜循环 / 天气（确定性；1× 时一天=24 现实分钟）
   ============================================================ */

const ENV = {
  minutes: 8 * 60,        // 游戏时刻（分钟，0=午夜）
  dayLen: 24,             // 1× 时一天对应的现实分钟数
  weather: "sunny",       // sunny | cloudy | rain
  weatherLeft: 90,        // 剩余游戏分钟
  rng: null,

  reset(seed) {
    this.minutes = 8 * 60;
    this.rng = new Rng((seed === undefined ? 77 : seed) >>> 0);
    this.weather = "sunny";
    this.weatherLeft = this.rng.range(60, 150);
  },
  /* dt=现实秒；scale=演示加速倍率（战斗模式为 1） */
  tick(dt, scale) {
    if (dt <= 0) return;
    this.minutes += dt * (24 / this.dayLen) * (scale || 1);   // 1×: 1 现实秒 = 1 游戏分钟
    this.weatherLeft -= dt * (scale || 1) / 60;               // 按游戏分钟流逝
    if (this.weatherLeft <= 0) this.rollWeather();
  },
  rollWeather() {
    const r = this.rng.next();
    this.weather = r < 0.5 ? "sunny" : (r < 0.8 ? "cloudy" : "rain");
    this.weatherLeft = this.rng.range(60, 180);
  },
  clockText() {
    const m = Math.floor(this.minutes) % 1440;
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  },
  isNight() { const m = this.minutes % 1440; return m >= 19.5 * 60 || m < 5.5 * 60; },
  isRain() { return this.weather === "rain"; },
  isCloudy() { return this.weather === "cloudy"; },

  /* 天色：地面色 + 全屏罩色（黄昏/黎明暖色，夜间冷色） */
  skyTint() {
    const h = (this.minutes % 1440) / 60;
    let overlay = null, ground = "#11150f";
    if (h >= 7 && h < 17.5) { overlay = null; }
    else if (h >= 17.5 && h < 19.5) {
      const t = 1 - Math.abs((h - 18.5) / 1);
      overlay = "rgba(255,140,60," + (0.10 * Math.max(0, t)).toFixed(3) + ")";
    } else if (h >= 5.5 && h < 7) {
      const t = 1 - Math.abs((h - 6.25) / 0.75);
      overlay = "rgba(255,180,120," + (0.08 * Math.max(0, t)).toFixed(3) + ")";
    } else { overlay = "rgba(10,14,38,.32)"; ground = "#0b0e13"; }
    return { overlay, ground };
  }
};

ENV.reset();
