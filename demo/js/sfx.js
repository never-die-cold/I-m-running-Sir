"use strict";
/* ============================================================
   sfx.js —— WebAudio 合成音效 v2（双振荡+低通+噪声层，更厚实）
   无素材；默认低音量（SETT.volume），M 静音；headless 静默降级。
   ============================================================ */

const Sfx = (() => {
  let actx = null, master = null, noiseBuf = null;
  let muted = Store.read("muted", false);
  let volume = SETT.data.volume;

  function ensure() {
    if (actx || muted) return actx;
    try {
      const AC = typeof AudioContext !== "undefined" ? AudioContext
        : (typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null);
      if (!AC) return null;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = volume;
      master.connect(actx.destination);
      /* 白噪声缓冲（打击/摩擦层） */
      const len = Math.floor(actx.sampleRate * 0.5);
      noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { actx = null; }
    return actx;
  }
  function beep(freq, dur, type, delay, vol, lp) {
    const c = ensure();
    if (!c || muted) return;
    try {
      const t0 = c.currentTime + (delay || 0);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.5, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      /* 双失谐振荡叠加，听感更厚 */
      for (const det of [1, 1.006]) {
        const o = c.createOscillator();
        o.type = type || "sine";
        o.frequency.value = freq * det;
        o.connect(g);
        o.start(t0); o.stop(t0 + dur + 0.05);
      }
      if (lp) {
        const f = c.createBiquadFilter();
        f.type = "lowpass"; f.frequency.value = lp;
        g.connect(f); f.connect(master);
      } else g.connect(master);
    } catch (e) {}
  }
  function noise(vol, dur, delay, freq, q) {
    const c = ensure();
    if (!c || muted || !noiseBuf) return;
    try {
      const t0 = c.currentTime + (delay || 0);
      const src = c.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const f = c.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q || 1;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t0); src.stop(t0 + dur + 0.05);
    } catch (e) {}
  }
  return {
    unlock() { ensure(); },          // 首次用户手势时调用（浏览器自动播放策略）
    setVolume(v) { volume = v; if (master) master.gain.value = muted ? 0 : v; },
    get volume() { return volume; },
    play(name) {
      switch (name) {
        case "checkpoint": beep(660, .12, "triangle", 0, .5, 2600); beep(880, .16, "triangle", .09, .5, 3000); noise(.12, .09, .09, 3400, 2); break;
        case "ach":        [523, 659, 784, 1047].forEach((f, i) => beep(f, .14, "triangle", i * .09, .5, 3400)); noise(.1, .25, .27, 5200, 1.4); break;
        case "record":     beep(784, .10, "sine", 0, .5, 3000); beep(988, .15, "sine", .10, .5, 3400); break;
        case "levelup":    [440, 554, 659, 880].forEach((f, i) => beep(f, .12, "square", i * .08, .28, 1800)); break;
        case "shoot":      beep(190, .05, "square", 0, .13, 1100); noise(.10, .04, 0, 2600, 2.2); break;
        case "hurt":       beep(100, .10, "sawtooth", 0, .32, 800); noise(.20, .07, 0, 480, 1.2); break;
        case "death":      [300, 220, 150].forEach((f, i) => beep(f, .20, "sawtooth", i * .13, .32, 900)); noise(.16, .4, .1, 300, .8); break;
        case "victory":    [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, .22, "triangle", i * .11, .4, 3800)); noise(.1, .5, .1, 6000, 1); break;
        case "click":      beep(880, .04, "sine", 0, .18, 3000); break;
        case "coin":       beep(988, .05, "triangle", 0, .22, 4200); beep(1319, .07, "triangle", .05, .18, 4800); break;
        case "heal":       beep(660, .08, "sine", 0, .22, 2800); beep(880, .12, "sine", .07, .22, 3200); break;
        case "dash":       noise(.20, .12, 0, 1300, .8); beep(520, .06, "sine", 0, .18, 2400); beep(300, .09, "sine", .04, .22, 1800); break;
        case "buy":        beep(523, .07, "triangle", 0, .3, 2800); beep(784, .1, "triangle", .07, .3, 3200); break;
      }
    },
    get muted() { return muted; },
    toggle() { muted = !muted; Store.write("muted", muted); if (!muted) ensure(); if (master) master.gain.value = muted ? 0 : volume; return muted; }
  };
})();
